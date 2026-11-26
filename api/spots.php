<?php
/**
 * API Lahan Parkir Warga (Spots), Promosi UMKM Sekitar, & Bookmark
 */
declare(strict_types=1);
require_once __DIR__ . '/../config/database.php';

$pdo = getDB();
$action = $_GET['action'] ?? 'list';

try {
    if ($action === 'list') {
        $rows = $pdo->query(
            'SELECT p.*,
                    u.id AS umkm_id, u.name AS umkm_name, u.category AS umkm_category,
                    u.distance_label AS umkm_distance, u.promo_title AS umkm_promo_title,
                    u.promo_desc AS umkm_promo_desc, u.promo_code AS umkm_promo_code,
                    u.open_hours AS umkm_hours, u.monthly_fee AS umkm_fee
             FROM parking_spots p
             LEFT JOIN umkm_merchants u ON u.spot_id = p.id AND u.is_active = 1
             ORDER BY p.distance_m ASC, p.id ASC'
        )->fetchAll();

        $spots = [];
        $umkmList = [];
        foreach ($rows as $r) {
            $availCar  = max(0, (int)$r['slots_car'] - (int)$r['occupied_car']);
            $availBike = max(0, (int)$r['slots_bike'] - (int)$r['occupied_bike']);
            $availMain = ($r['category'] === 'Motor') ? $availBike : ($availCar > 0 ? $availCar : $availBike);
            $totalMain = ($r['category'] === 'Motor') ? (int)$r['slots_bike'] : (int)$r['slots_car'];

            $umkmObj = null;
            if (!empty($r['umkm_id'])) {
                $umkmObj = [
                    'id'          => (int)$r['umkm_id'],
                    'spotId'      => (int)$r['id'],
                    'name'        => $r['umkm_name'],
                    'category'    => $r['umkm_category'],
                    'distance'    => $r['umkm_distance'],
                    'promoTitle'  => $r['umkm_promo_title'],
                    'promoDesc'   => $r['umkm_promo_desc'],
                    'promoCode'   => $r['umkm_promo_code'],
                    'hours'       => $r['umkm_hours'],
                    'monthlyFee'  => (int)$r['umkm_fee'],
                ];
                $umkmList[] = $umkmObj;
            }

            $spots[] = [
                'id'             => (int)$r['id'],
                'landownerId'    => (int)$r['landowner_id'],
                'name'           => $r['name'],
                'shortName'      => $r['short_name'],
                'category'       => $r['category'],
                'address'        => $r['address'],
                'accessNote'     => $r['access_note'] ?: $r['address'],
                'distance'       => (int)$r['distance_m'] . 'm',
                'distanceNum'    => (int)$r['distance_m'],
                'slotsCar'       => (int)$r['slots_car'],
                'slotsBike'      => (int)$r['slots_bike'],
                'occupiedCar'    => (int)$r['occupied_car'],
                'occupiedBike'   => (int)$r['occupied_bike'],
                'availableCar'   => $availCar,
                'availableBike'  => $availBike,
                'availableSlots' => $availMain,
                'totalSlots'     => max(1, $totalMain),
                'rating'         => (float)$r['rating_avg'],
                'reviews'        => (int)$r['reviews_count'],
                'priceMotor'     => (int)$r['price_motor'],
                'priceMobil'     => (int)$r['price_mobil'],
                'jukirName'      => $r['jukir_label'],
                'jukirPhone'     => $r['jukir_phone'],
                'facilities'     => json_decode($r['facilities_json'] ?: '[]', true) ?: [],
                'photo'          => $r['photo_url'],
                'top'            => $r['map_top'],
                'left'           => $r['map_left'],
                'lat'            => isset($r['latitude']) ? (float)$r['latitude'] : -7.9428,
                'lng'            => isset($r['longitude']) ? (float)$r['longitude'] : 112.6163,
                'isOpen'         => (bool)$r['is_open'],
                'umkm'           => $umkmObj,
            ];
        }

        jsonResponse(['ok' => true, 'spots' => $spots, 'umkm' => $umkmList]);
    }

    if ($action === 'create') {
        $user = requireAuthUser($pdo);
        if ($user['role'] !== 'LANDOWNER') {
            jsonResponse(['ok' => false, 'message' => 'Hanya akun Pemilik Lahan yang dapat mendaftarkan garasi baru.'], 403);
        }
        $data = getJsonBody();
        $name       = trim((string)($data['name'] ?? ''));
        $address    = trim((string)($data['address'] ?? ''));
        $accessNote = trim((string)($data['access_note'] ?? $address));
        $slotsCar   = max(0, (int)($data['slots_car'] ?? 2));
        $slotsBike  = max(0, (int)($data['slots_bike'] ?? 5));

        if ($name === '' || $address === '' || ($slotsCar + $slotsBike) <= 0) {
            jsonResponse(['ok' => false, 'message' => 'Nama lahan, alamat, dan minimal 1 slot wajib diisi.'], 422);
        }

        $shortName = implode(' ', array_slice(preg_split('/\s+/', $name), 0, 2));
        $category  = $slotsCar > 0 ? 'Mobil' : 'Motor';
        $positions = [['38%', '64%'], ['62%', '20%'], ['22%', '68%'], ['50%', '72%']];
        $malangCoords = [[-7.9465, 112.6138], [-7.9512, 112.6185], [-7.9401, 112.6202], [-7.9554, 112.6152]];
        $cnt = (int)$pdo->query('SELECT COUNT(*) FROM parking_spots')->fetchColumn();
        $pos = $positions[$cnt % count($positions)];
        $defCoord = $malangCoords[$cnt % count($malangCoords)];
        $lat = isset($data['lat']) && is_numeric($data['lat']) ? (float)$data['lat'] : $defCoord[0];
        $lng = isset($data['lng']) && is_numeric($data['lng']) ? (float)$data['lng'] : $defCoord[1];

        $stmt = $pdo->prepare(
            'INSERT INTO parking_spots
             (landowner_id, attendant_id, name, short_name, category, address, access_note, distance_m,
              slots_car, slots_bike, occupied_car, occupied_bike, price_motor, price_mobil,
              jukir_label, jukir_phone, facilities_json, photo_url, map_top, map_left, latitude, longitude, rating_avg, reviews_count, is_open)
             VALUES (?, 3, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 5.00, 1, 1)'
        );
        $stmt->execute([
            $user['id'],
            $name,
            $shortName,
            $category,
            $address,
            $accessNote,
            280 + ($cnt * 60),
            $slotsCar,
            $slotsBike,
            RP_TARIFF_MOTOR_FLAT,
            RP_TARIFF_MOBIL_FLAT,
            'Slamet Riyadi (ID: JK-04)',
            '0878-9988-7766',
            json_encode(['Mitra Terverifikasi', 'Dijaga Jukir', 'Akses Mudah']),
            'https://images.unsplash.com/photo-1590674899484-d5640e854abe?w=600&auto=format&fit=crop&q=80',
            $pos[0],
            $pos[1],
            $lat,
            $lng,
        ]);

        jsonResponse([
            'ok'      => true,
            'spot_id' => (int)$pdo->lastInsertId(),
            'message' => 'Lahan "' . $name . '" tersimpan di db_parkir & langsung tampil di peta Pengemudi!',
        ], 201);
    }

    if ($action === 'toggle') {
        $user = requireAuthUser($pdo);
        if ($user['role'] !== 'LANDOWNER') {
            jsonResponse(['ok' => false, 'message' => 'Hanya Pemilik Lahan yang dapat mengubah status garasi.'], 403);
        }
        $data = getJsonBody();
        $spotId = (int)($data['spot_id'] ?? 0);
        $stmt = $pdo->prepare('SELECT id, name, is_open, landowner_id FROM parking_spots WHERE id = ?');
        $stmt->execute([$spotId]);
        $spot = $stmt->fetch();
        if (!$spot || (int)$spot['landowner_id'] !== $user['id']) {
            jsonResponse(['ok' => false, 'message' => 'Lahan tidak ditemukan atau bukan milik akun Anda.'], 404);
        }
        $next = $spot['is_open'] ? 0 : 1;
        $upd = $pdo->prepare('UPDATE parking_spots SET is_open = ? WHERE id = ?');
        $upd->execute([$next, $spotId]);

        jsonResponse([
            'ok'      => true,
            'is_open' => (bool)$next,
            'message' => $next ? 'Lahan "' . $spot['name'] . '" dibuka untuk pemesanan.' : 'Lahan "' . $spot['name'] . '" ditutup sementara.',
        ]);
    }

    if ($action === 'update_quota') {
        $user = requireAuthUser($pdo);
        if ($user['role'] !== 'LANDOWNER') {
            jsonResponse(['ok' => false, 'message' => 'Hanya Pemilik Lahan yang dapat mengubah kuota slot.'], 403);
        }
        $data = getJsonBody();
        $spotId    = (int)($data['spot_id'] ?? 0);
        $slotsCar  = max(0, (int)($data['slots_car'] ?? 0));
        $slotsBike = max(0, (int)($data['slots_bike'] ?? 0));
        if ($spotId <= 0 || ($slotsCar + $slotsBike) <= 0) {
            jsonResponse(['ok' => false, 'message' => 'Minimal harus ada 1 slot mobil atau motor.'], 422);
        }
        $upd = $pdo->prepare('UPDATE parking_spots SET slots_car = ?, slots_bike = ?, category = ? WHERE id = ? AND landowner_id = ?');
        $upd->execute([$slotsCar, $slotsBike, $slotsCar > 0 ? 'Mobil' : 'Motor', $spotId, $user['id']]);
        jsonResponse(['ok' => true, 'message' => 'Kuota slot garasi berhasil diperbarui di database.']);
    }

    if ($action === 'bookmark') {
        $user = requireAuthUser($pdo);
        $data = getJsonBody();
        $spotId = (int)($data['spot_id'] ?? 0);
        $chk = $pdo->prepare('SELECT 1 FROM bookmarks WHERE user_id = ? AND spot_id = ?');
        $chk->execute([$user['id'], $spotId]);
        if ($chk->fetch()) {
            $del = $pdo->prepare('DELETE FROM bookmarks WHERE user_id = ? AND spot_id = ?');
            $del->execute([$user['id'], $spotId]);
            $saved = false;
        } else {
            $ins = $pdo->prepare('INSERT INTO bookmarks (user_id, spot_id) VALUES (?, ?)');
            $ins->execute([$user['id'], $spotId]);
            $saved = true;
        }
        jsonResponse([
            'ok'      => true,
            'saved'   => $saved,
            'message' => $saved ? 'Disimpan ke daftar favorit.' : 'Dihapus dari garasi tersimpan.',
        ]);
    }

    jsonResponse(['ok' => false, 'message' => 'Aksi spots tidak dikenal.'], 400);
} catch (Throwable $e) {
    jsonResponse(['ok' => false, 'message' => 'Kesalahan server: ' . $e->getMessage()], 500);
}
