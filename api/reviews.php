<?php
/**
 * API Penilaian & Ulasan Bintang 1–5 (Core Feature Quality Control — SOP Bab 12.5)
 */
declare(strict_types=1);
require_once __DIR__ . '/../config/database.php';

$pdo = getDB();

try {
    $user = requireAuthUser($pdo);
    if ($user['role'] !== 'DRIVER') {
        jsonResponse(['ok' => false, 'message' => 'Hanya Pengemudi yang dapat mengirim ulasan parkir.'], 403);
    }
    $data = getJsonBody();

    $bookingCode = strtoupper(ltrim(trim((string)($data['booking_code'] ?? '')), '#'));
    $rating      = max(1, min(5, (int)($data['rating'] ?? 5)));
    $tags        = is_array($data['tags'] ?? null) ? implode(', ', $data['tags']) : trim((string)($data['tags'] ?? ''));
    $comment     = trim((string)($data['comment'] ?? ''));

    if ($bookingCode === '') {
        jsonResponse(['ok' => false, 'message' => 'Kode booking wajib disertakan.'], 422);
    }

    $pdo->beginTransaction();

    $bStmt = $pdo->prepare('SELECT id, spot_id, driver_id FROM bookings WHERE booking_code = ? AND driver_id = ? LIMIT 1');
    $bStmt->execute([$bookingCode, $user['id']]);
    $booking = $bStmt->fetch();
    if (!$booking) {
        $pdo->rollBack();
        jsonResponse(['ok' => false, 'message' => 'Transaksi #' . $bookingCode . ' tidak ditemukan pada akun Anda.'], 404);
    }

    $qcFlag = ($rating < 3) ? 1 : 0;
    $ins = $pdo->prepare(
        'INSERT INTO reviews (booking_id, spot_id, driver_id, rating, feedback_tags, comment, qc_flag)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE rating = VALUES(rating), feedback_tags = VALUES(feedback_tags), comment = VALUES(comment), qc_flag = VALUES(qc_flag)'
    );
    $ins->execute([(int)$booking['id'], (int)$booking['spot_id'], (int)$booking['driver_id'], $rating, $tags, $comment ?: null, $qcFlag]);

    // Update spot aggregate rating cleanly
    $spStmt = $pdo->prepare('SELECT rating_avg, reviews_count FROM parking_spots WHERE id = ? FOR UPDATE');
    $spStmt->execute([(int)$booking['spot_id']]);
    $sp = $spStmt->fetch();
    if ($sp) {
        $oldCnt = max(1, (int)$sp['reviews_count']);
        $oldAvg = (float)$sp['rating_avg'];
        $newCnt = $oldCnt + 1;
        $newAvg = round((($oldAvg * $oldCnt) + $rating) / $newCnt, 2);
        $pdo->prepare('UPDATE parking_spots SET rating_avg = ?, reviews_count = ? WHERE id = ?')
            ->execute([$newAvg, $newCnt, (int)$booking['spot_id']]);
    }

    $pdo->commit();

    jsonResponse([
        'ok'      => true,
        'rating'  => $rating,
        'qc_flag' => (bool)$qcFlag,
        'message' => $qcFlag
            ? "Ulasan {$rating} Bintang tersimpan. Tiket evaluasi QC operasional otomatis dibuat (SOP <3 bintang)."
            : "Terima kasih! Penilaian {$rating} Bintang tersimpan di database.",
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    jsonResponse(['ok' => false, 'message' => 'Kesalahan server: ' . $e->getMessage()], 500);
}
