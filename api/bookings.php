<?php
/**
 * API Reservasi Slot, E-Tiket Aktif, Argometer Server-Side, & Riwayat Driver
 */
declare(strict_types=1);
require_once __DIR__ . '/../config/database.php';

$pdo = getDB();
$action = $_GET['action'] ?? 'list';

try {
    $user = requireAuthUser($pdo);

    if ($action === 'list') {
        $stmt = $pdo->prepare(
            "SELECT b.*, p.name AS spot_name, p.short_name AS spot_short, p.jukir_label, p.jukir_phone, p.access_note,
                    r.rating AS review_rating, r.feedback_tags AS review_tags, r.qc_flag AS review_qc,
                    IF(b.checked_in_at IS NOT NULL AND b.status = 'ACTIVE', TIMESTAMPDIFF(SECOND, b.checked_in_at, NOW()), 0) AS elapsed_sec
             FROM bookings b
             JOIN parking_spots p ON p.id = b.spot_id
             LEFT JOIN reviews r ON r.booking_id = b.id
             WHERE b.driver_id = ?
             ORDER BY b.id DESC
             LIMIT 30"
        );
        $stmt->execute([$user['id']]);
        $rows = $stmt->fetchAll();

        $activeBooking = null;
        $history = [];
        foreach ($rows as $row) {
            $item = [
                'id'                => (int)$row['id'],
                'code'              => $row['booking_code'],
                'spotId'            => (int)$row['spot_id'],
                'spotName'          => $row['spot_name'],
                'spotShort'         => $row['spot_short'],
                'jukirName'         => $row['jukir_label'],
                'jukirPhone'        => $row['jukir_phone'],
                'accessNote'        => $row['access_note'],
                'vehicle'           => $row['vehicle_type'],
                'plate'             => $row['plate_number'],
                'slot'              => $row['slot_label'],
                'plannedDuration'   => (int)$row['planned_duration_hours'],
                'paymentMethod'     => $row['payment_method'],
                'promoCode'         => $row['promo_code'],
                'usedRuangPass'     => (bool)$row['used_ruangpass'],
                'baseParkingTariff' => (int)$row['base_parking_tariff'],
                'platformFee'       => (int)$row['platform_fee'],
                'overstayHours'     => (int)$row['overstay_hours'],
                'overstayPaid'      => (int)$row['overstay_fee'],
                'depositPaid'       => (int)$row['base_parking_tariff'] + (int)$row['platform_fee'],
                'cost'              => (int)$row['total_user_paid'],
                'shareLandowner'    => (int)$row['share_landowner'],
                'shareJukir'        => (int)$row['share_jukir'],
                'sharePlatform'     => (int)$row['share_platform'],
                'status'            => $row['status'],
                'checkedInAt'       => $row['checked_in_at'],
                'checkedOutAt'      => $row['checked_out_at'],
                'duration'          => $row['actual_duration_label'] ?: ('Rencana ' . $row['planned_duration_hours'] . ' Jam'),
                'date'              => date('d M Y, H:i', strtotime($row['created_at'])),
                'elapsedSec'        => max(0, (int)$row['elapsed_sec']),
                'isRated'           => $row['review_rating'] !== null,
                'rating'            => $row['review_rating'] !== null ? (int)$row['review_rating'] : null,
                'qcFlag'            => (bool)$row['review_qc'],
            ];

            if ($activeBooking === null && in_array($row['status'], ['WAITING_CHECKIN', 'ACTIVE'], true)) {
                $activeBooking = $item;
            }
            $history[] = $item;
        }

        // If no live ticket, keep latest non-cancelled (FINISHED) booking handy for E-Ticket summary/review state
        if ($activeBooking === null) {
            foreach ($history as $hItem) {
                if ($hItem['status'] !== 'CANCELLED') {
                    $activeBooking = $hItem;
                    break;
                }
            }
        }

        jsonResponse([
            'ok'            => true,
            'activeBooking' => $activeBooking,
            'history'       => $history,
        ]);
    }

    if ($action === 'create') {
        if ($user['role'] !== 'DRIVER') {
            jsonResponse(['ok' => false, 'message' => 'Hanya akun Pengemudi (Driver) yang dapat melakukan reservasi parkir.'], 403);
        }
        $data = getJsonBody();
        $spotId          = (int)($data['spot_id'] ?? 1);
        $vehicleType     = strtoupper(trim((string)($data['vehicle_type'] ?? 'MOBIL')));
        $plateNumber     = strtoupper(trim((string)($data['plate_number'] ?? 'N 1234 ABC')));
        $plannedDuration = max(1, min(12, (int)($data['planned_duration'] ?? 3)));
        $paymentMethod   = strtoupper(trim((string)($data['payment_method'] ?? 'SALDO')));
        $promoCode       = strtoupper(trim((string)($data['promo_code'] ?? '')));
        $useRuangPass    = !empty($data['use_ruangpass']);

        if (!in_array($vehicleType, ['MOBIL', 'MOTOR'], true)) {
            $vehicleType = 'MOBIL';
        }
        if ($plateNumber === '') {
            jsonResponse(['ok' => false, 'message' => 'Nomor plat kendaraan wajib diisi.'], 422);
        }

        $pdo->beginTransaction();

        // Lock spot row for concurrency-safe slot allocation
        $spStmt = $pdo->prepare('SELECT * FROM parking_spots WHERE id = ? FOR UPDATE');
        $spStmt->execute([$spotId]);
        $spot = $spStmt->fetch();
        if (!$spot || !$spot['is_open']) {
            $pdo->rollBack();
            jsonResponse(['ok' => false, 'message' => 'Maaf, lahan parkir sedang tutup atau tidak ditemukan.'], 409);
        }

        if ($vehicleType === 'MOBIL') {
            if ((int)$spot['occupied_car'] >= (int)$spot['slots_car']) {
                $pdo->rollBack();
                jsonResponse(['ok' => false, 'message' => 'Slot mobil di garasi ini sedang penuh.'], 409);
            }
            $slotLabel = 'Slot A-0' . ((int)$spot['occupied_car'] + 1);
            $baseTariff = (int)$spot['price_mobil'];
        } else {
            if ((int)$spot['occupied_bike'] >= (int)$spot['slots_bike']) {
                $pdo->rollBack();
                jsonResponse(['ok' => false, 'message' => 'Slot motor di garasi ini sedang penuh.'], 409);
            }
            $slotLabel = 'Slot M-0' . ((int)$spot['occupied_bike'] + 1);
            $baseTariff = (int)$spot['price_motor'];
        }

        // Lock user row
        $uStmt = $pdo->prepare('SELECT * FROM users WHERE id = ? FOR UPDATE');
        $uStmt->execute([$user['id']]);
        $uRow = $uStmt->fetch();
        $balance = (int)$uRow['wallet_balance'];

        $ruangPassId = null;
        $platformFee = RP_PLATFORM_FEE;
        $appliedPromo = null;

        if ($useRuangPass && $vehicleType === 'MOTOR') {
            $rpStmt = $pdo->prepare(
                "SELECT * FROM ruangpass_subscriptions
                 WHERE user_id = ? AND status = 'ACTIVE' AND remaining_quota > 0 AND expires_at >= NOW()
                 ORDER BY id DESC LIMIT 1 FOR UPDATE"
            );
            $rpStmt->execute([$user['id']]);
            $rp = $rpStmt->fetch();
            if (!$rp) {
                $pdo->rollBack();
                jsonResponse(['ok' => false, 'message' => 'Kuota RuangPass aktif tidak tersedia.'], 409);
            }
            $ruangPassId = (int)$rp['id'];
            $newQuota = (int)$rp['remaining_quota'] - 1;
            $newStatus = $newQuota <= 0 ? 'DEPLETED' : 'ACTIVE';
            $pdo->prepare('UPDATE ruangpass_subscriptions SET remaining_quota = ?, status = ? WHERE id = ?')
                ->execute([$newQuota, $newStatus, $ruangPassId]);

            $baseTariff = 0;
            $platformFee = 0;
            $paymentMethod = 'RUANGPASS';
        } else {
            $useRuangPass = false;
            if (in_array($promoCode, ['HEMAT1K', 'DISKONPARKIR'], true)) {
                $platformFee = 0;
                $appliedPromo = $promoCode;
            }
            if (!in_array($paymentMethod, ['SALDO', 'QRIS'], true)) {
                $paymentMethod = 'SALDO';
            }
        }

        $totalNow = $baseTariff + $platformFee;
        if (!$useRuangPass && $paymentMethod === 'SALDO') {
            if ($balance < $totalNow) {
                $pdo->rollBack();
                jsonResponse(['ok' => false, 'code' => 'INSUFFICIENT_BALANCE', 'message' => 'Saldo RuangPay tidak mencukupi. Silakan Top Up terlebih dahulu.'], 402);
            }
            $balance -= $totalNow;
            $pdo->prepare('UPDATE users SET wallet_balance = ? WHERE id = ?')->execute([$balance, $user['id']]);
        }

        // Occupy 1 slot
        if ($vehicleType === 'MOBIL') {
            $pdo->prepare('UPDATE parking_spots SET occupied_car = occupied_car + 1 WHERE id = ?')->execute([$spotId]);
        } else {
            $pdo->prepare('UPDATE parking_spots SET occupied_bike = occupied_bike + 1 WHERE id = ?')->execute([$spotId]);
        }

        $bookingCode = 'RP-' . random_int(10000, 99999);
        $vehLabel = $vehicleType === 'MOBIL' ? 'Mobil Tamu' : 'Motor Tamu';
        $ins = $pdo->prepare(
            'INSERT INTO bookings
             (booking_code, driver_id, spot_id, attendant_id, vehicle_type, vehicle_label, plate_number, slot_label,
              planned_duration_hours, payment_method, promo_code, used_ruangpass, ruangpass_id,
              base_parking_tariff, platform_fee, total_user_paid, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "WAITING_CHECKIN")'
        );
        $ins->execute([
            $bookingCode,
            $user['id'],
            $spotId,
            $spot['attendant_id'] ?: 3,
            $vehicleType,
            $vehLabel,
            $plateNumber,
            $slotLabel,
            $plannedDuration,
            $paymentMethod,
            $appliedPromo,
            $useRuangPass ? 1 : 0,
            $ruangPassId,
            $baseTariff,
            $platformFee,
            $totalNow,
        ]);
        $bookingId = (int)$pdo->lastInsertId();

        if (!$useRuangPass && $paymentMethod === 'SALDO') {
            logWalletTx(
                $pdo,
                $user['id'],
                $bookingId,
                'BOOKING_PAY',
                -$totalNow,
                $balance,
                'Deposit Parkir #' . $bookingCode . ' (' . $vehicleType . ' Flat 3 Jam + Fee Rp' . number_format($platformFee, 0, ',', '.') . ')'
            );
        }

        $pdo->commit();

        jsonResponse([
            'ok'             => true,
            'booking_id'     => $bookingId,
            'booking_code'   => $bookingCode,
            'wallet_balance' => $balance,
            'message'        => $useRuangPass
                ? '1 Kuota RuangPass terpakai. E-Tiket #' . $bookingCode . ' aktif!'
                : 'Pembayaran Rp ' . number_format($totalNow, 0, ',', '.') . ' berhasil. E-Tiket #' . $bookingCode . ' aktif!',
        ], 201);
    }

    if ($action === 'cancel') {
        if ($user['role'] !== 'DRIVER') {
            jsonResponse(['ok' => false, 'message' => 'Aksi ini khusus untuk Pengemudi.'], 403);
        }
        $data = getJsonBody();
        $bookingId = (int)($data['booking_id'] ?? 0);

        $pdo->beginTransaction();
        $bStmt = $pdo->prepare("SELECT * FROM bookings WHERE id = ? AND driver_id = ? AND status = 'WAITING_CHECKIN' LIMIT 1 FOR UPDATE");
        $bStmt->execute([$bookingId, $user['id']]);
        $bk = $bStmt->fetch();
        if (!$bk) {
            $pdo->rollBack();
            jsonResponse(['ok' => false, 'message' => 'Hanya pesanan berstatus Menunggu Check-In yang dapat dibatalkan.'], 409);
        }

        // Release slot
        if ($bk['vehicle_type'] === 'MOBIL') {
            $pdo->prepare('UPDATE parking_spots SET occupied_car = GREATEST(0, occupied_car - 1) WHERE id = ?')->execute([(int)$bk['spot_id']]);
        } else {
            $pdo->prepare('UPDATE parking_spots SET occupied_bike = GREATEST(0, occupied_bike - 1) WHERE id = ?')->execute([(int)$bk['spot_id']]);
        }

        // Refund RuangPass quota OR RuangPay balance
        $newBal = (int)$user['wallet_balance'];
        if (!empty($bk['used_ruangpass']) && !empty($bk['ruangpass_id'])) {
            $pdo->prepare("UPDATE ruangpass_subscriptions SET remaining_quota = remaining_quota + 1, status = 'ACTIVE' WHERE id = ?")
                ->execute([(int)$bk['ruangpass_id']]);
        } elseif ($bk['payment_method'] === 'SALDO' && (int)$bk['total_user_paid'] > 0) {
            $uStmt = $pdo->prepare('SELECT wallet_balance FROM users WHERE id = ? FOR UPDATE');
            $uStmt->execute([$user['id']]);
            $newBal = (int)$uStmt->fetchColumn() + (int)$bk['total_user_paid'];
            $pdo->prepare('UPDATE users SET wallet_balance = ? WHERE id = ?')->execute([$newBal, $user['id']]);
            logWalletTx($pdo, $user['id'], (int)$bk['id'], 'TOPUP', (int)$bk['total_user_paid'], $newBal, 'Pengembalian Dana Pembatalan #' . $bk['booking_code']);
        }

        $pdo->prepare("UPDATE bookings SET status = 'CANCELLED', actual_duration_label = 'Dibatalkan' WHERE id = ?")->execute([(int)$bk['id']]);
        $pdo->commit();

        $cancelMsg = !empty($bk['used_ruangpass'])
            ? 'Pesanan RuangPass #' . $bk['booking_code'] . ' dibatalkan. Slot dilepas & 1 Kuota RuangPass dikembalikan.'
            : 'Pesanan #' . $bk['booking_code'] . ' dibatalkan. Slot dilepas & deposit dikembalikan.';
        jsonResponse(['ok' => true, 'wallet_balance' => $newBal, 'message' => $cancelMsg]);
    }

    jsonResponse(['ok' => false, 'message' => 'Aksi bookings tidak dikenal.'], 400);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    jsonResponse(['ok' => false, 'message' => 'Kesalahan server: ' . $e->getMessage()], 500);
}
