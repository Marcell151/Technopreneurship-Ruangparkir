<?php
/**
 * API Pembayaran Nyata Midtrans Snap (Sandbox) — RuangParkir
 * Mendukung: Reservasi Parkir (BOOKING), Top Up RuangPay (TOPUP), & Langganan RuangPass (RUANGPASS)
 * Verifikasi status langsung ke Midtrans Core Status API + dukungan Webhook SHA-512
 */
declare(strict_types=1);
require_once __DIR__ . '/../config/database.php';

$pdo = getDB();
$action = $_GET['action'] ?? 'create_token';

function midtransHttpRequest(string $method, string $url, ?array $body = null): array
{
    $ch = curl_init($url);
    $headers = [
        'Accept: application/json',
        'Authorization: Basic ' . base64_encode(MIDTRANS_SERVER_KEY . ':'),
    ];
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_TIMEOUT        => 20,
    ];
    if ($method === 'POST') {
        $headers[] = 'Content-Type: application/json';
        $opts[CURLOPT_POST] = true;
        $opts[CURLOPT_POSTFIELDS] = json_encode($body ?? [], JSON_UNESCAPED_UNICODE);
    }
    $opts[CURLOPT_HTTPHEADER] = $headers;
    curl_setopt_array($ch, $opts);
    $raw = curl_exec($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($curlErr !== '') {
        return ['http_code' => 0, 'error' => 'Koneksi Midtrans gagal: ' . $curlErr, 'data' => null];
    }
    $decoded = json_decode((string)$raw, true);
    return ['http_code' => $httpCode, 'error' => null, 'data' => is_array($decoded) ? $decoded : ['raw' => $raw]];
}

/**
 * Eksekusi settlement idempoten setelah Midtrans mengonfirmasi pembayaran (settlement / capture)
 */
function fulfillPaidOrder(PDO $pdo, array $order, string $paymentType): array
{
    if ($order['midtrans_status'] === 'SETTLEMENT') {
        return [
            'already_settled' => true,
            'purpose'         => $order['purpose'],
            'booking_id'      => $order['booking_id'] ? (int)$order['booking_id'] : null,
            'message'         => 'Pembayaran Midtrans telah dikonfirmasi sebelumnya.',
        ];
    }

    $userId  = (int)$order['user_id'];
    $purpose = (string)$order['purpose'];
    $amount  = (int)$order['amount'];
    $payload = json_decode((string)($order['payload_json'] ?: '{}'), true) ?: [];

    if ($purpose === 'TOPUP') {
        $uStmt = $pdo->prepare('SELECT wallet_balance FROM users WHERE id = ? FOR UPDATE');
        $uStmt->execute([$userId]);
        $newBal = (int)$uStmt->fetchColumn() + $amount;
        $pdo->prepare('UPDATE users SET wallet_balance = ? WHERE id = ?')->execute([$newBal, $userId]);
        logWalletTx($pdo, $userId, null, 'TOPUP', $amount, $newBal, 'Top Up RuangPay via Midtrans (' . strtoupper($paymentType ?: 'SNAP') . ' #' . $order['order_id'] . ')');

        $pdo->prepare("UPDATE payment_orders SET midtrans_status = 'SETTLEMENT', payment_type = ?, settled_at = NOW() WHERE id = ?")
            ->execute([$paymentType ?: 'snap', (int)$order['id']]);

        return [
            'purpose'        => 'TOPUP',
            'wallet_balance' => $newBal,
            'message'        => 'Top Up Midtrans Rp ' . number_format($amount, 0, ',', '.') . ' lunas! Saldo RuangPay bertambah.',
        ];
    }

    if ($purpose === 'RUANGPASS') {
        $rpStmt = $pdo->prepare(
            "SELECT * FROM ruangpass_subscriptions WHERE user_id = ? AND status = 'ACTIVE' AND expires_at >= NOW() ORDER BY id DESC LIMIT 1 FOR UPDATE"
        );
        $rpStmt->execute([$userId]);
        $existing = $rpStmt->fetch();

        if ($existing) {
            $newRem = (int)$existing['remaining_quota'] + RP_RUANGPASS_QUOTA;
            $newTot = (int)$existing['total_quota'] + RP_RUANGPASS_QUOTA;
            $newExp = date('Y-m-d H:i:s', strtotime('+30 days'));
            $pdo->prepare('UPDATE ruangpass_subscriptions SET remaining_quota = ?, total_quota = ?, expires_at = ? WHERE id = ?')
                ->execute([$newRem, $newTot, $newExp, $existing['id']]);
        } else {
            $starts = date('Y-m-d H:i:s');
            $expires = date('Y-m-d H:i:s', strtotime('+30 days'));
            $pdo->prepare(
                'INSERT INTO ruangpass_subscriptions
                 (user_id, price_paid, total_quota, remaining_quota, landowner_pool, jukir_pool, platform_margin, payment_method, status, starts_at, expires_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, "QRIS", "ACTIVE", ?, ?)'
            )->execute([
                $userId, RP_RUANGPASS_PRICE, RP_RUANGPASS_QUOTA, RP_RUANGPASS_QUOTA,
                RP_RUANGPASS_OWNER_POOL, RP_RUANGPASS_JUKIR_POOL, RP_RUANGPASS_PLATFORM,
                $starts, $expires,
            ]);
            $newRem = RP_RUANGPASS_QUOTA;
        }

        $uBal = (int)$pdo->query("SELECT wallet_balance FROM users WHERE id = $userId")->fetchColumn();
        logWalletTx($pdo, $userId, null, 'RUANGPASS_BUY', 0, $uBal, 'Aktifkan RuangPass 20x via Midtrans (' . strtoupper($paymentType ?: 'SNAP') . ' #' . $order['order_id'] . ')');

        $pdo->prepare("UPDATE payment_orders SET midtrans_status = 'SETTLEMENT', payment_type = ?, settled_at = NOW() WHERE id = ?")
            ->execute([$paymentType ?: 'snap', (int)$order['id']]);

        return [
            'purpose'         => 'RUANGPASS',
            'remaining_quota' => $newRem,
            'message'         => 'Pembayaran Midtrans berhasil! RuangPass aktif (' . $newRem . ' kuota motor siap dipakai).',
        ];
    }

    // PURPOSE === 'BOOKING'
    $spotId          = (int)($payload['spot_id'] ?? 1);
    $vehicleType     = strtoupper((string)($payload['vehicle_type'] ?? 'MOBIL'));
    $plateNumber     = strtoupper((string)($payload['plate_number'] ?? 'N 1234 ABC'));
    $plannedDuration = max(1, min(12, (int)($payload['planned_duration'] ?? 3)));
    $promoCode       = $payload['promo_code'] ?? null;
    $baseTariff      = (int)($payload['base_tariff'] ?? ($vehicleType === 'MOTOR' ? RP_TARIFF_MOTOR_FLAT : RP_TARIFF_MOBIL_FLAT));
    $platformFee     = (int)($payload['platform_fee'] ?? RP_PLATFORM_FEE);

    $spStmt = $pdo->prepare('SELECT * FROM parking_spots WHERE id = ? FOR UPDATE');
    $spStmt->execute([$spotId]);
    $spot = $spStmt->fetch();
    if (!$spot) {
        throw new RuntimeException('Lahan parkir tidak ditemukan saat settlement.');
    }

    if ($vehicleType === 'MOBIL') {
        $slotLabel = 'Slot A-0' . ((int)$spot['occupied_car'] + 1);
        $pdo->prepare('UPDATE parking_spots SET occupied_car = occupied_car + 1 WHERE id = ?')->execute([$spotId]);
    } else {
        $slotLabel = 'Slot M-0' . ((int)$spot['occupied_bike'] + 1);
        $pdo->prepare('UPDATE parking_spots SET occupied_bike = occupied_bike + 1 WHERE id = ?')->execute([$spotId]);
    }

    $bookingCode = 'RP-' . random_int(10000, 99999);
    $vehLabel = $vehicleType === 'MOBIL' ? 'Mobil Tamu' : 'Motor Tamu';
    $ins = $pdo->prepare(
        'INSERT INTO bookings
         (booking_code, driver_id, spot_id, attendant_id, vehicle_type, vehicle_label, plate_number, slot_label,
          planned_duration_hours, payment_method, promo_code, used_ruangpass, ruangpass_id,
          base_parking_tariff, platform_fee, total_user_paid, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "QRIS", ?, 0, NULL, ?, ?, ?, "WAITING_CHECKIN")'
    );
    $ins->execute([
        $bookingCode, $userId, $spotId, $spot['attendant_id'] ?: 3,
        $vehicleType, $vehLabel, $plateNumber, $slotLabel,
        $plannedDuration, $promoCode ?: null, $baseTariff, $platformFee, $amount,
    ]);
    $bookingId = (int)$pdo->lastInsertId();

    $uBal = (int)$pdo->query("SELECT wallet_balance FROM users WHERE id = $userId")->fetchColumn();
    logWalletTx($pdo, $userId, $bookingId, 'BOOKING_PAY', 0, $uBal, 'Bayar Parkir #' . $bookingCode . ' via Midtrans (' . strtoupper($paymentType ?: 'SNAP') . ' Rp' . number_format($amount, 0, ',', '.') . ')');

    $pdo->prepare("UPDATE payment_orders SET midtrans_status = 'SETTLEMENT', payment_type = ?, booking_id = ?, settled_at = NOW() WHERE id = ?")
        ->execute([$paymentType ?: 'snap', $bookingId, (int)$order['id']]);

    return [
        'purpose'      => 'BOOKING',
        'booking_id'   => $bookingId,
        'booking_code' => $bookingCode,
        'message'      => 'Pembayaran Midtrans Rp ' . number_format($amount, 0, ',', '.') . ' lunas! E-Tiket #' . $bookingCode . ' aktif.',
    ];
}

try {
    // 1. BUAT SNAP TOKEN MIDTRANS NYATA
    if ($action === 'create_token') {
        $user = requireAuthUser($pdo);
        if ($user['role'] !== 'DRIVER') {
            jsonResponse(['ok' => false, 'message' => 'Pembayaran Midtrans hanya tersedia untuk akun Pengemudi.'], 403);
        }

        $data    = getJsonBody();
        $purpose = strtoupper(trim((string)($data['purpose'] ?? 'BOOKING')));
        if (!in_array($purpose, ['BOOKING', 'TOPUP', 'RUANGPASS'], true)) {
            jsonResponse(['ok' => false, 'message' => 'Tujuan pembayaran tidak valid.'], 422);
        }

        $amount = 0;
        $items = [];
        $metaPayload = [];
        $prefix = 'RP-PAY';

        if ($purpose === 'TOPUP') {
            $amount = (int)($data['amount'] ?? 0);
            if ($amount < 10000 || $amount > 5000000) {
                jsonResponse(['ok' => false, 'message' => 'Nominal Top Up harus Rp10.000 – Rp5.000.000.'], 422);
            }
            $prefix = 'RP-TOPUP';
            $items = [[
                'id'       => 'TOPUP-RUANGPAY',
                'price'    => $amount,
                'quantity' => 1,
                'name'     => 'Top Up Saldo RuangPay',
            ]];
            $metaPayload = ['amount' => $amount];
        } elseif ($purpose === 'RUANGPASS') {
            $amount = RP_RUANGPASS_PRICE;
            $prefix = 'RP-PASS';
            $items = [[
                'id'       => 'RUANGPASS-20X',
                'price'    => RP_RUANGPASS_PRICE,
                'quantity' => 1,
                'name'     => 'Langganan RuangPass (20x Motor / 30 Hari)',
            ]];
            $metaPayload = ['quota' => RP_RUANGPASS_QUOTA];
        } else {
            // BOOKING
            $spotId          = (int)($data['spot_id'] ?? 1);
            $vehicleType     = strtoupper(trim((string)($data['vehicle_type'] ?? 'MOBIL')));
            $plateNumber     = strtoupper(trim((string)($data['plate_number'] ?? ($user['default_plate'] ?: 'N 1234 ABC'))));
            $plannedDuration = max(1, min(12, (int)($data['planned_duration'] ?? 3)));
            $promoCode       = strtoupper(trim((string)($data['promo_code'] ?? '')));

            if (!in_array($vehicleType, ['MOBIL', 'MOTOR'], true)) {
                $vehicleType = 'MOBIL';
            }
            if ($plateNumber === '') {
                jsonResponse(['ok' => false, 'message' => 'Nomor plat kendaraan wajib diisi.'], 422);
            }

            $spStmt = $pdo->prepare('SELECT * FROM parking_spots WHERE id = ?');
            $spStmt->execute([$spotId]);
            $spot = $spStmt->fetch();
            if (!$spot || !$spot['is_open']) {
                jsonResponse(['ok' => false, 'message' => 'Lahan parkir sedang tutup atau tidak ditemukan.'], 409);
            }
            if ($vehicleType === 'MOBIL' && (int)$spot['occupied_car'] >= (int)$spot['slots_car']) {
                jsonResponse(['ok' => false, 'message' => 'Slot mobil di garasi ini sedang penuh.'], 409);
            }
            if ($vehicleType === 'MOTOR' && (int)$spot['occupied_bike'] >= (int)$spot['slots_bike']) {
                jsonResponse(['ok' => false, 'message' => 'Slot motor di garasi ini sedang penuh.'], 409);
            }

            $baseTariff  = $vehicleType === 'MOBIL' ? (int)$spot['price_mobil'] : (int)$spot['price_motor'];
            $platformFee = in_array($promoCode, ['HEMAT1K', 'DISKONPARKIR'], true) ? 0 : RP_PLATFORM_FEE;
            $amount      = $baseTariff + $platformFee;
            $prefix      = 'RP-BOOK';

            $items[] = [
                'id'       => 'PARK-' . $vehicleType . '-' . $spotId,
                'price'    => $baseTariff,
                'quantity' => 1,
                'name'     => substr('Parkir ' . $vehicleType . ' Flat 3 Jam - ' . $spot['short_name'], 0, 50),
            ];
            if ($platformFee > 0) {
                $items[] = [
                    'id'       => 'PLATFORM-FEE',
                    'price'    => $platformFee,
                    'quantity' => 1,
                    'name'     => 'Biaya Layanan Aplikasi RuangParkir',
                ];
            }
            $metaPayload = [
                'spot_id'          => $spotId,
                'vehicle_type'     => $vehicleType,
                'plate_number'     => $plateNumber,
                'planned_duration' => $plannedDuration,
                'promo_code'       => $platformFee === 0 ? $promoCode : null,
                'base_tariff'      => $baseTariff,
                'platform_fee'     => $platformFee,
            ];
        }

        $orderId = $prefix . '-' . date('YmdHis') . '-' . random_int(100, 999);
        $snapBody = [
            'transaction_details' => [
                'order_id'     => $orderId,
                'gross_amount' => $amount,
            ],
            'item_details'     => $items,
            'customer_details' => [
                'first_name' => $user['name'],
                'email'      => $user['email'],
                'phone'      => $user['phone'],
            ],
            'expiry' => [
                'unit'     => 'minutes',
                'duration' => 15,
            ],
        ];

        $mtRes = midtransHttpRequest('POST', MIDTRANS_SNAP_API, $snapBody);
        if ($mtRes['error'] !== null || $mtRes['http_code'] < 200 || $mtRes['http_code'] >= 300 || empty($mtRes['data']['token'])) {
            $errMsg = $mtRes['error'] ?? implode('; ', (array)($mtRes['data']['error_messages'] ?? ['Gagal membuat token Midtrans Snap.']));
            jsonResponse(['ok' => false, 'message' => 'Midtrans Snap Error: ' . $errMsg], 502);
        }

        $snapToken   = (string)$mtRes['data']['token'];
        $redirectUrl = (string)($mtRes['data']['redirect_url'] ?? '');

        $ins = $pdo->prepare(
            'INSERT INTO payment_orders (order_id, user_id, purpose, amount, snap_token, redirect_url, payload_json, midtrans_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, "PENDING")'
        );
        $ins->execute([
            $orderId, $user['id'], $purpose, $amount, $snapToken, $redirectUrl,
            json_encode($metaPayload, JSON_UNESCAPED_UNICODE),
        ]);

        jsonResponse([
            'ok'           => true,
            'order_id'     => $orderId,
            'amount'       => $amount,
            'purpose'      => $purpose,
            'snap_token'   => $snapToken,
            'redirect_url' => $redirectUrl,
            'client_key'   => MIDTRANS_CLIENT_KEY,
        ], 201);
    }

    // 2. VERIFIKASI STATUS LANGSUNG KE MIDTRANS CORE STATUS API
    if ($action === 'verify') {
        $user = requireAuthUser($pdo);
        $data = getJsonBody();
        $orderId = trim((string)($data['order_id'] ?? ($_GET['order_id'] ?? '')));
        if ($orderId === '') {
            jsonResponse(['ok' => false, 'message' => 'Order ID Midtrans wajib disertakan.'], 422);
        }

        // Cek status nyata di server Midtrans
        $stRes = midtransHttpRequest('GET', MIDTRANS_STATUS_API . '/' . urlencode($orderId) . '/status');
        if ($stRes['error'] !== null) {
            jsonResponse(['ok' => false, 'message' => $stRes['error']], 502);
        }

        $txStatus    = strtolower((string)($stRes['data']['transaction_status'] ?? 'pending'));
        $fraudStatus = strtolower((string)($stRes['data']['fraud_status'] ?? 'accept'));
        $paymentType = (string)($stRes['data']['payment_type'] ?? 'snap');

        $isPaid = ($txStatus === 'settlement') || ($txStatus === 'capture' && $fraudStatus === 'accept');

        $pdo->beginTransaction();
        $oStmt = $pdo->prepare('SELECT * FROM payment_orders WHERE order_id = ? AND user_id = ? LIMIT 1 FOR UPDATE');
        $oStmt->execute([$orderId, $user['id']]);
        $order = $oStmt->fetch();
        if (!$order) {
            $pdo->rollBack();
            jsonResponse(['ok' => false, 'message' => 'Transaksi Midtrans tidak ditemukan pada akun Anda.'], 404);
        }

        if ($isPaid) {
            $result = fulfillPaidOrder($pdo, $order, $paymentType);
            $pdo->commit();
            jsonResponse(['ok' => true, 'paid' => true, 'midtrans_status' => 'SETTLEMENT', 'payment_type' => $paymentType] + $result);
        }

        if (in_array($txStatus, ['deny', 'cancel', 'expire', 'failure'], true)) {
            $pdo->prepare('UPDATE payment_orders SET midtrans_status = ?, payment_type = ? WHERE id = ?')
                ->execute([strtoupper($txStatus), $paymentType, (int)$order['id']]);
        }
        $pdo->commit();

        jsonResponse([
            'ok'              => true,
            'paid'            => false,
            'midtrans_status' => strtoupper($txStatus),
            'payment_type'    => $paymentType,
            'order_id'        => $orderId,
            'message'         => 'Status Midtrans saat ini: ' . strtoupper($txStatus) . '. Silakan selesaikan pembayaran lalu klik Cek Status.',
        ]);
    }

    // 3. WEBHOOK NOTIFICATION ENDPOINT (SHA-512 SIGNATURE VALIDATION)
    if ($action === 'webhook') {
        $data = getJsonBody();
        $orderId     = (string)($data['order_id'] ?? '');
        $statusCode  = (string)($data['status_code'] ?? '');
        $grossAmount = (string)($data['gross_amount'] ?? '');
        $sigKey      = (string)($data['signature_key'] ?? '');
        $txStatus    = strtolower((string)($data['transaction_status'] ?? ''));
        $fraudStatus = strtolower((string)($data['fraud_status'] ?? 'accept'));
        $paymentType = (string)($data['payment_type'] ?? 'snap');

        $expectedSig = hash('sha512', $orderId . $statusCode . $grossAmount . MIDTRANS_SERVER_KEY);
        if ($orderId === '' || !hash_equals($expectedSig, $sigKey)) {
            jsonResponse(['ok' => false, 'message' => 'Invalid Midtrans signature'], 403);
        }

        $pdo->beginTransaction();
        $oStmt = $pdo->prepare('SELECT * FROM payment_orders WHERE order_id = ? LIMIT 1 FOR UPDATE');
        $oStmt->execute([$orderId]);
        $order = $oStmt->fetch();
        if (!$order) {
            $pdo->rollBack();
            jsonResponse(['ok' => false, 'message' => 'Order not found'], 404);
        }

        if ($txStatus === 'settlement' || ($txStatus === 'capture' && $fraudStatus === 'accept')) {
            fulfillPaidOrder($pdo, $order, $paymentType);
        } elseif (in_array($txStatus, ['deny', 'cancel', 'expire', 'failure'], true)) {
            $pdo->prepare('UPDATE payment_orders SET midtrans_status = ?, payment_type = ? WHERE id = ?')
                ->execute([strtoupper($txStatus), $paymentType, (int)$order['id']]);
        }
        $pdo->commit();
        jsonResponse(['ok' => true, 'order_id' => $orderId, 'status' => strtoupper($txStatus)]);
    }

    jsonResponse(['ok' => false, 'message' => 'Aksi midtrans tidak dikenal.'], 400);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    jsonResponse(['ok' => false, 'message' => 'Kesalahan server Midtrans: ' . $e->getMessage()], 500);
}
