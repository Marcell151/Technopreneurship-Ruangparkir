<?php
/**
 * API Operasional Lapangan (Juru Parkir Scanner Check-In/Out, Settlement 40:40:20 + Fee Rp1.000, & Dashboard Pemilik Lahan)
 */
declare(strict_types=1);
require_once __DIR__ . '/../config/database.php';

$pdo = getDB();
$action = $_GET['action'] ?? 'overview';

try {
    $user = requireAuthUser($pdo);

    if ($action === 'overview') {
        // Scope vehicles by role (Landowner sees their own garages; Attendant sees managed spots)
        if ($user['role'] === 'LANDOWNER') {
            $bStmt = $pdo->prepare(
                "SELECT b.*, p.name AS spot_name, p.short_name AS spot_short,
                        IF(b.checked_in_at IS NOT NULL AND b.status = 'ACTIVE', TIMESTAMPDIFF(SECOND, b.checked_in_at, NOW()), 0) AS elapsed_sec
                 FROM bookings b
                 JOIN parking_spots p ON p.id = b.spot_id
                 WHERE p.landowner_id = ? AND b.status IN ('WAITING_CHECKIN', 'ACTIVE')
                 ORDER BY FIELD(b.status, 'WAITING_CHECKIN', 'ACTIVE'), b.id DESC"
            );
            $bStmt->execute([$user['id']]);
            $bRows = $bStmt->fetchAll();
        } else {
            $bRows = $pdo->query(
                "SELECT b.*, p.name AS spot_name, p.short_name AS spot_short,
                        IF(b.checked_in_at IS NOT NULL AND b.status = 'ACTIVE', TIMESTAMPDIFF(SECOND, b.checked_in_at, NOW()), 0) AS elapsed_sec
                 FROM bookings b
                 JOIN parking_spots p ON p.id = b.spot_id
                 WHERE b.status IN ('WAITING_CHECKIN', 'ACTIVE')
                 ORDER BY FIELD(b.status, 'WAITING_CHECKIN', 'ACTIVE'), b.id DESC"
            )->fetchAll();
        }

        $waitingQueue = [];
        $activeVehicles = [];
        foreach ($bRows as $r) {
            $sec = max(0, (int)$r['elapsed_sec']);
            $item = [
                'id'                => (int)$r['id'],
                'code'              => $r['booking_code'],
                'spotId'            => (int)$r['spot_id'],
                'spotName'          => $r['spot_name'],
                'plate'             => $r['plate_number'],
                'type'              => $r['vehicle_label'],
                'vehicleKind'       => $r['vehicle_type'],
                'slot'              => $r['slot_label'],
                'status'            => $r['status'],
                'elapsedSec'        => $sec,
                'baseParkingTariff' => (int)$r['base_parking_tariff'],
                'platformFee'       => (int)$r['platform_fee'],
                'usedRuangPass'     => (bool)$r['used_ruangpass'],
                'paymentMethod'     => $r['payment_method'],
                'note'              => $r['used_ruangpass'] ? ('RuangPass #' . $r['booking_code']) : ('Booking #' . $r['booking_code']),
            ];
            if ($r['status'] === 'WAITING_CHECKIN') {
                $waitingQueue[] = $item;
            }
            $activeVehicles[] = $item;
        }

        // Landowner (id=2 or current landowner) & Attendant (id=3 or current attendant) live balances
        $ownerId = ($user['role'] === 'LANDOWNER') ? $user['id'] : 2;
        $jukirId = ($user['role'] === 'ATTENDANT') ? $user['id'] : 3;

        $ownerBal = (int)$pdo->query("SELECT wallet_balance FROM users WHERE id = $ownerId")->fetchColumn();
        $jukirBal = (int)$pdo->query("SELECT wallet_balance FROM users WHERE id = $jukirId")->fetchColumn();

        // Hitung statistik NYATA dari database db_parkir (tanpa angka fiktif hardcoded)
        $ownerTodayStmt = $pdo->prepare(
            "SELECT COALESCE(SUM(b.share_landowner), 0) AS owner_today
             FROM bookings b
             JOIN parking_spots p ON p.id = b.spot_id
             WHERE p.landowner_id = ? AND b.status = 'FINISHED' AND DATE(b.checked_out_at) = CURDATE()"
        );
        $ownerTodayStmt->execute([$ownerId]);
        $ownerToday = (int)$ownerTodayStmt->fetchColumn();

        $allOwnerStmt = $pdo->prepare(
            "SELECT COALESCE(SUM(b.share_landowner), 0)
             FROM bookings b
             JOIN parking_spots p ON p.id = b.spot_id
             WHERE p.landowner_id = ? AND b.status = 'FINISHED'"
        );
        $allOwnerStmt->execute([$ownerId]);
        $ownerAllTime = (int)$allOwnerStmt->fetchColumn();

        $jukirStatsStmt = $pdo->prepare(
            "SELECT COUNT(*) AS handled_count,
                    COALESCE(SUM(share_platform), 0) AS platform_sum
             FROM bookings
             WHERE attendant_id = ? AND status IN ('ACTIVE', 'FINISHED')"
        );
        $jukirStatsStmt->execute([$jukirId]);
        $jukirStats = $jukirStatsStmt->fetch();

        // My garages for landowner
        $gStmt = $pdo->prepare('SELECT * FROM parking_spots WHERE landowner_id = ? ORDER BY id ASC');
        $gStmt->execute([$ownerId]);
        $garages = array_map(fn($g) => [
            'id'            => (int)$g['id'],
            'name'          => $g['name'],
            'shortName'     => $g['short_name'],
            'address'       => $g['address'],
            'slotsCar'      => (int)$g['slots_car'],
            'slotsBike'     => (int)$g['slots_bike'],
            'occupiedCar'   => (int)$g['occupied_car'],
            'occupiedBike'  => (int)$g['occupied_bike'],
            'priceFlatCar'  => (int)$g['price_mobil'],
            'priceFlatBike' => (int)$g['price_motor'],
            'isOpen'        => (bool)$g['is_open'],
        ], $gStmt->fetchAll());

        // Recent wallet transactions for current user
        $txStmt = $pdo->prepare(
            'SELECT id, tx_type, amount, balance_after, description, created_at
             FROM wallet_transactions WHERE user_id = ? ORDER BY id DESC LIMIT 12'
        );
        $txStmt->execute([$user['id']]);

        jsonResponse([
            'ok'                    => true,
            'waitingQueue'          => $waitingQueue,
            'parkedVehicles'        => $activeVehicles,
            'myGarages'             => $garages,
            'landownerBalance'      => $ownerBal,
            'todayLandownerRevenue' => $ownerToday > 0 ? $ownerToday : $ownerAllTime,
            'attendantEarnings'     => $jukirBal,
            'vehiclesManagedToday'  => (int)($jukirStats['handled_count'] ?? 0),
            'platformRevenueToday'  => (int)($jukirStats['platform_sum'] ?? 0),
            'walletLogs'            => $txStmt->fetchAll(),
        ]);
    }

    if ($action === 'scan_in') {
        if ($user['role'] !== 'ATTENDANT') {
            jsonResponse(['ok' => false, 'message' => 'Hanya Petugas Juru Parkir (Attendant) yang dapat memvalidasi Check-In.'], 403);
        }
        $data = getJsonBody();
        $bookingId   = (int)($data['booking_id'] ?? 0);
        $bookingCode = strtoupper(ltrim(trim((string)($data['booking_code'] ?? '')), '#'));

        if ($bookingId > 0) {
            $stmt = $pdo->prepare("SELECT * FROM bookings WHERE id = ? AND status = 'WAITING_CHECKIN' LIMIT 1");
            $stmt->execute([$bookingId]);
        } elseif ($bookingCode !== '') {
            $stmt = $pdo->prepare("SELECT * FROM bookings WHERE booking_code = ? AND status = 'WAITING_CHECKIN' LIMIT 1");
            $stmt->execute([$bookingCode]);
        } else {
            $stmt = $pdo->query("SELECT * FROM bookings WHERE status = 'WAITING_CHECKIN' ORDER BY id DESC LIMIT 1");
        }
        $booking = $stmt->fetch();
        if (!$booking) {
            jsonResponse(['ok' => false, 'message' => 'Tidak ada tiket menunggu Check-In yang cocok.'], 404);
        }

        // Start server-side argometer timestamp (NOW())
        $upd = $pdo->prepare("UPDATE bookings SET status = 'ACTIVE', checked_in_at = NOW(), attendant_id = ? WHERE id = ?");
        $upd->execute([$user['role'] === 'ATTENDANT' ? $user['id'] : 3, $booking['id']]);

        jsonResponse([
            'ok'           => true,
            'booking_id'   => (int)$booking['id'],
            'booking_code' => $booking['booking_code'],
            'message'      => 'Scan Check-In #' . $booking['booking_code'] . ' (' . $booking['plate_number'] . ') berhasil! Argometer server dimulai.',
        ]);
    }

    if ($action === 'scan_out') {
        if ($user['role'] !== 'ATTENDANT') {
            jsonResponse(['ok' => false, 'message' => 'Hanya Petugas Juru Parkir (Attendant) yang dapat memproses Check-Out.'], 403);
        }
        $data = getJsonBody();
        $bookingId   = (int)($data['booking_id'] ?? 0);
        $bookingCode = strtoupper(ltrim(trim((string)($data['booking_code'] ?? '')), '#'));
        $scenario    = (string)($data['scenario'] ?? 'scenario_realtime');

        $pdo->beginTransaction();

        if ($bookingId > 0) {
            $stmt = $pdo->prepare("SELECT * FROM bookings WHERE id = ? AND status IN ('ACTIVE','WAITING_CHECKIN') LIMIT 1 FOR UPDATE");
            $stmt->execute([$bookingId]);
        } elseif ($bookingCode !== '') {
            $stmt = $pdo->prepare("SELECT * FROM bookings WHERE booking_code = ? AND status IN ('ACTIVE','WAITING_CHECKIN') LIMIT 1 FOR UPDATE");
            $stmt->execute([$bookingCode]);
        } else {
            $stmt = $pdo->query("SELECT * FROM bookings WHERE status = 'ACTIVE' ORDER BY id DESC LIMIT 1 FOR UPDATE");
        }
        $booking = $stmt->fetch();
        if (!$booking) {
            $pdo->rollBack();
            jsonResponse(['ok' => false, 'message' => 'Tidak ditemukan tiket parkir aktif untuk Check-Out.'], 404);
        }

        // Determine overstay hours & label (Real Server-Side OR Tabel 10.1 Demo Presets)
        $overstayHours = 0;
        $durationLabel = '1 Jam 45 Menit (Flat)';
        if ($scenario === 'scenario_4h') {
            $overstayHours = 1;
            $durationLabel = '4 Jam (+1 Jam)';
        } elseif ($scenario === 'scenario_5h') {
            $overstayHours = 2;
            $durationLabel = '5 Jam (+2 Jam)';
        } elseif ($scenario === 'scenario_6h') {
            $overstayHours = 3;
            $durationLabel = '6 Jam (+3 Jam)';
        } elseif ($scenario === 'scenario_1h45m') {
            $overstayHours = 0;
            $durationLabel = '1 Jam 45 Menit (Flat)';
        } else {
            // Real-time server timestamp calculation (rounded up above 3 hours = 10800s)
            $elapsedSec = 0;
            if (!empty($booking['checked_in_at'])) {
                $elapsedSec = max(0, time() - strtotime($booking['checked_in_at']));
            }
            $h = (int)floor($elapsedSec / 3600);
            $m = (int)floor(($elapsedSec % 3600) / 60);
            if ($elapsedSec > 10800) {
                $overstayHours = (int)ceil(($elapsedSec - 10800) / 3600);
                $durationLabel = "{$h}j {$m}m (+{$overstayHours} Jam)";
            } else {
                $overstayHours = 0;
                $durationLabel = ($h > 0 || $m > 0) ? "{$h}j {$m}m (Flat)" : '< 1 Menit (Flat)';
            }
        }

        $overstayFee = $overstayHours * RP_OVERSTAY_PER_HOUR;
        $usedRuangPass = (bool)$booking['used_ruangpass'];
        $split = calculateSplitServer(
            (int)$booking['base_parking_tariff'],
            $overstayFee,
            (int)$booking['platform_fee'],
            $usedRuangPass
        );

        // Charge overstay to Driver RuangPay if payment_method === SALDO or RUANGPASS (auto-debit bila saldo cukup)
        $driverId = (int)$booking['driver_id'];
        if ($overstayFee > 0 && in_array($booking['payment_method'], ['SALDO', 'RUANGPASS'], true)) {
            $dStmt = $pdo->prepare('SELECT wallet_balance FROM users WHERE id = ? FOR UPDATE');
            $dStmt->execute([$driverId]);
            $driverBal = (int)$dStmt->fetchColumn();
            if ($booking['payment_method'] === 'SALDO' && $driverBal < $overstayFee) {
                $pdo->rollBack();
                jsonResponse([
                    'ok'      => false,
                    'code'    => 'INSUFFICIENT_BALANCE',
                    'message' => 'Saldo RuangPay pengemudi kurang untuk overstay Rp ' . number_format($overstayFee, 0, ',', '.') . '.',
                ], 402);
            }
            if ($driverBal >= $overstayFee) {
                $driverBal -= $overstayFee;
                $pdo->prepare('UPDATE users SET wallet_balance = ? WHERE id = ?')->execute([$driverBal, $driverId]);
                $ovDesc = $usedRuangPass
                    ? 'Auto-Debit Overstay RuangPass #' . $booking['booking_code'] . ' (' . $durationLabel . ')'
                    : 'Auto-Debit Overstay #' . $booking['booking_code'] . ' (' . $durationLabel . ')';
                logWalletTx($pdo, $driverId, (int)$booking['id'], 'OVERSTAY_PAY', -$overstayFee, $driverBal, $ovDesc);
            }
        }

        // Get spot owner & attendant to credit share (40% reguler OR Pool Rp1.000/pihak RuangPass + 40% overstay)
        $spStmt = $pdo->prepare('SELECT id, landowner_id, attendant_id FROM parking_spots WHERE id = ? FOR UPDATE');
        $spStmt->execute([(int)$booking['spot_id']]);
        $spot = $spStmt->fetch();
        $landownerId = (int)($spot['landowner_id'] ?? 2);
        $attendantId = (int)($booking['attendant_id'] ?: ($spot['attendant_id'] ?? 3));

        // Credit Landowner
        $lStmt = $pdo->prepare('SELECT wallet_balance FROM users WHERE id = ? FOR UPDATE');
        $lStmt->execute([$landownerId]);
        $ownerNewBal = (int)$lStmt->fetchColumn() + $split['share_landowner'];
        $pdo->prepare('UPDATE users SET wallet_balance = ? WHERE id = ?')->execute([$ownerNewBal, $landownerId]);
        $ownerTxDesc = $usedRuangPass
            ? 'Alokasi Pool RuangPass Pemilik (Rp1.000' . ($overstayFee > 0 ? ' + 40% Overstay' : '') . ') #' . $booking['booking_code']
            : 'Bagi Hasil Pemilik (40%) #' . $booking['booking_code'];
        logWalletTx($pdo, $landownerId, (int)$booking['id'], 'REVENUE_SHARE', $split['share_landowner'], $ownerNewBal, $ownerTxDesc);

        // Credit Attendant
        $aStmt = $pdo->prepare('SELECT wallet_balance FROM users WHERE id = ? FOR UPDATE');
        $aStmt->execute([$attendantId]);
        $jukirNewBal = (int)$aStmt->fetchColumn() + $split['share_jukir'];
        $pdo->prepare('UPDATE users SET wallet_balance = ? WHERE id = ?')->execute([$jukirNewBal, $attendantId]);
        $jukirTxDesc = $usedRuangPass
            ? 'Alokasi Pool RuangPass Jukir (Rp1.000' . ($overstayFee > 0 ? ' + 40% Overstay' : '') . ') #' . $booking['booking_code']
            : 'Upah Bagi Hasil Jukir (40%) #' . $booking['booking_code'];
        logWalletTx($pdo, $attendantId, (int)$booking['id'], 'REVENUE_SHARE', $split['share_jukir'], $jukirNewBal, $jukirTxDesc);

        // Release slot
        if ($booking['vehicle_type'] === 'MOBIL') {
            $pdo->prepare('UPDATE parking_spots SET occupied_car = GREATEST(0, occupied_car - 1) WHERE id = ?')->execute([(int)$booking['spot_id']]);
        } else {
            $pdo->prepare('UPDATE parking_spots SET occupied_bike = GREATEST(0, occupied_bike - 1) WHERE id = ?')->execute([(int)$booking['spot_id']]);
        }

        // Finalize booking record
        $updB = $pdo->prepare(
            "UPDATE bookings
             SET status = 'FINISHED',
                 checked_out_at = NOW(),
                 actual_duration_label = ?,
                 overstay_hours = ?,
                 overstay_fee = ?,
                 total_user_paid = ?,
                 share_landowner = ?,
                 share_jukir = ?,
                 share_platform = ?
             WHERE id = ?"
        );
        $updB->execute([
            $durationLabel,
            $overstayHours,
            $overstayFee,
            $split['total_user_paid'],
            $split['share_landowner'],
            $split['share_jukir'],
            $split['share_platform'],
            (int)$booking['id'],
        ]);

        $pdo->commit();

        jsonResponse([
            'ok'           => true,
            'booking_id'   => (int)$booking['id'],
            'booking_code' => $booking['booking_code'],
            'duration'     => $durationLabel,
            'split'        => $split,
            'message'      => $usedRuangPass
                ? 'Check-out RuangPass #' . $booking['booking_code'] . ' selesai. Alokasi mitra Rp1.000/pihak tercatat di db_parkir.'
                : 'Check-out #' . $booking['booking_code'] . ' selesai! Bagi hasil 40:40:20 + Fee Rp' . number_format($split['platform_fee'], 0, ',', '.') . ' tersalurkan.',
        ]);
    }

    jsonResponse(['ok' => false, 'message' => 'Aksi attendant tidak dikenal.'], 400);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    jsonResponse(['ok' => false, 'message' => 'Kesalahan server: ' . $e->getMessage()], 500);
}
