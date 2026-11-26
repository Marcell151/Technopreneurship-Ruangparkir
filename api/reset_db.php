<?php
/**
 * API Reset Database db_parkir ke Data Awal (Khusus Lingkungan Lokal / Presentasi)
 * Membaca langsung database/db_parkir.sql agar selalu sinkron 100% dengan skema & seed utama.
 */
declare(strict_types=1);
require_once __DIR__ . '/../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['ok' => false, 'message' => 'Metode harus POST.'], 405);
}

// Batasi hanya untuk akses localhost (keamanan bila suatu saat di-deploy ke server publik)
$remoteAddr = $_SERVER['REMOTE_ADDR'] ?? '';
if (!in_array($remoteAddr, ['127.0.0.1', '::1', 'localhost'], true)) {
    jsonResponse(['ok' => false, 'message' => 'Reset database hanya diizinkan dari lingkungan lokal (localhost).'], 403);
}

$sqlFile = __DIR__ . '/../database/db_parkir.sql';
if (!is_file($sqlFile)) {
    jsonResponse(['ok' => false, 'message' => 'File database/db_parkir.sql tidak ditemukan.'], 500);
}

try {
    $pdo = getDB();
    $pdo->exec('SET NAMES utf8mb4');

    $rawSql = file_get_contents($sqlFile);
    if ($rawSql === false || trim($rawSql) === '') {
        throw new RuntimeException('Gagal membaca isi database/db_parkir.sql.');
    }

    // Hapus komentar satu baris (-- ...) dan pecah statement SQL dengan aman
    $lines = preg_split('/\R/', $rawSql);
    $cleanLines = [];
    foreach ($lines as $line) {
        $trimmed = trim($line);
        if ($trimmed === '' || str_starts_with($trimmed, '--')) {
            continue;
        }
        $cleanLines[] = $line;
    }
    $cleanSql = implode("\n", $cleanLines);

    // Split by semicolon di luar tanda kutip tunggal
    $statements = [];
    $buffer = '';
    $inQuote = false;
    $len = strlen($cleanSql);
    for ($i = 0; $i < $len; $i++) {
        $ch = $cleanSql[$i];
        if ($ch === "'" && ($i === 0 || $cleanSql[$i - 1] !== '\\')) {
            $inQuote = !$inQuote;
        }
        if ($ch === ';' && !$inQuote) {
            $stmt = trim($buffer);
            if ($stmt !== '') {
                $statements[] = $stmt;
            }
            $buffer = '';
        } else {
            $buffer .= $ch;
        }
    }
    if (trim($buffer) !== '') {
        $statements[] = trim($buffer);
    }

    $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    foreach ($statements as $stmt) {
        // Lewati CREATE DATABASE / USE karena koneksi PDO sudah terhubung ke db_parkir
        if (preg_match('/^(CREATE\s+DATABASE|USE\s+)/i', $stmt)) {
            continue;
        }
        $pdo->exec($stmt);
    }
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

    // Bersihkan sesi login aktif agar kembali ke halaman Login dengan state segar
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
    }
    session_destroy();

    jsonResponse([
        'ok'      => true,
        'message' => 'Database db_parkir berhasil di-reset ke data awal bersih! Silakan login kembali.',
    ]);
} catch (Throwable $e) {
    jsonResponse(['ok' => false, 'message' => 'Gagal mereset database: ' . $e->getMessage()], 500);
}
