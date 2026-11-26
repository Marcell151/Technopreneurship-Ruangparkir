<?php
/**
 * Konfigurasi Database MySQL (db_parkir) & Helper REST API RuangParkir
 * Selaras dengan arsitektur BAB VIII & prinsip keamanan BAB XIII (UU PDP No. 27/2022)
 */

declare(strict_types=1);

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

date_default_timezone_set('Asia/Jakarta');

const DB_HOST = '127.0.0.1';
const DB_NAME = 'db_parkir';
const DB_USER = 'root';
const DB_PASS = '';

// Load .env lokal jika tersedia (Midtrans Sandbox Keys)
$envPath = __DIR__ . '/../.env';
if (is_file($envPath)) {
    foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }
        [$k, $v] = array_map('trim', explode('=', $line, 2));
        $v = trim($v, " \t\n\r\0\x0B\"'");
        if ($k !== '' && getenv($k) === false) {
            putenv("$k=$v");
            $_ENV[$k] = $v;
        }
    }
}

// Konfigurasi Midtrans Payment Gateway (Sandbox — membaca dari .env lokal)
$mtIsProd = filter_var(getenv('MIDTRANS_IS_PRODUCTION') ?: 'false', FILTER_VALIDATE_BOOLEAN);
$mtServerKey = trim((string)(getenv('MIDTRANS_SERVER_KEY') ?: ''));
if ($mtServerKey === '' || str_contains($mtServerKey, 'YOUR_')) {
    $mtServerKey = base64_decode('TWlkLXNlcnZlci14RkRBYUtiRVpmdldBUjVwaWlkZGRkTmE=');
}
$mtClientKey = trim((string)(getenv('MIDTRANS_CLIENT_KEY') ?: ''));
if ($mtClientKey === '' || str_contains($mtClientKey, 'YOUR_')) {
    $mtClientKey = base64_decode('TWlkLWNsaWVudC1uckxOMDk0bEl6bDM2ZWtN');
}
define('MIDTRANS_IS_PRODUCTION', $mtIsProd);
define('MIDTRANS_SERVER_KEY', $mtServerKey);
define('MIDTRANS_CLIENT_KEY', $mtClientKey);
define('MIDTRANS_SNAP_JS', $mtIsProd ? 'https://app.midtrans.com/snap/snap.js' : 'https://app.sandbox.midtrans.com/snap/snap.js');
define('MIDTRANS_SNAP_API', $mtIsProd ? 'https://app.midtrans.com/snap/v1/transactions' : 'https://app.sandbox.midtrans.com/snap/v1/transactions');
define('MIDTRANS_STATUS_API', $mtIsProd ? 'https://api.midtrans.com/v2' : 'https://api.sandbox.midtrans.com/v2');

// Konstanta Bisnis Final UAS (Tabel 10.1 & Bab X)
const RP_PLATFORM_FEE        = 1000;
const RP_TARIFF_MOTOR_FLAT   = 3000;
const RP_TARIFF_MOBIL_FLAT   = 8000;
const RP_OVERSTAY_PER_HOUR   = 1000;
const RP_RUANGPASS_PRICE     = 55000;
const RP_RUANGPASS_QUOTA     = 20;
const RP_RUANGPASS_OWNER_POOL = 20000;
const RP_RUANGPASS_JUKIR_POOL = 20000;
const RP_RUANGPASS_PLATFORM  = 15000;
const RP_RUANGPASS_PER_USE   = 1000;
const RP_MIN_WITHDRAW        = 50000;

function getDB(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }
    return $pdo;
}

function jsonResponse(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function getJsonBody(): array
{
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return $_POST ?: [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function requireAuthUser(PDO $pdo): array
{
    if (empty($_SESSION['user_id'])) {
        jsonResponse(['ok' => false, 'message' => 'Sesi login tidak ditemukan. Silakan masuk terlebih dahulu.'], 401);
    }
    $stmt = $pdo->prepare('SELECT id, role, name, phone, email, avatar_text, default_plate, bank_info, wallet_balance, created_at FROM users WHERE id = ?');
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();
    if (!$user) {
        unset($_SESSION['user_id']);
        jsonResponse(['ok' => false, 'message' => 'Akun tidak ditemukan.'], 401);
    }
    $user['id'] = (int)$user['id'];
    $user['wallet_balance'] = (int)$user['wallet_balance'];
    return $user;
}

/**
 * Single Source of Truth perhitungan bagi hasil 40:40:20 + Fee Rp1.000 (Tabel 10.1) & RuangPass
 */
function calculateSplitServer(int $baseParkingTariff, int $overstayFee, int $platformFeeApplied, bool $usedRuangPass): array
{
    if ($usedRuangPass) {
        $ovLandowner = (int)round($overstayFee * 0.4);
        $ovJukir     = (int)round($overstayFee * 0.4);
        $ovPlatform  = (int)round($overstayFee * 0.2);
        return [
            'base_parking_tariff'  => 0,
            'overstay_fee'         => $overstayFee,
            'total_parking_tariff' => $overstayFee,
            'platform_fee'         => 0,
            'total_user_paid'      => $overstayFee,
            'share_landowner'      => RP_RUANGPASS_PER_USE + $ovLandowner,
            'share_jukir'          => RP_RUANGPASS_PER_USE + $ovJukir,
            'platform_commission'  => $ovPlatform,
            'share_platform'       => $ovPlatform,
            'used_ruangpass'       => true,
        ];
    }

    $totalParkingTariff = $baseParkingTariff + $overstayFee;
    $shareLandowner     = (int)round($totalParkingTariff * 0.4);
    $shareJukir         = (int)round($totalParkingTariff * 0.4);
    $platformCommission = (int)round($totalParkingTariff * 0.2);
    $sharePlatform      = $platformCommission + $platformFeeApplied;
    $totalUserPaid      = $totalParkingTariff + $platformFeeApplied;

    return [
        'base_parking_tariff'  => $baseParkingTariff,
        'overstay_fee'         => $overstayFee,
        'total_parking_tariff' => $totalParkingTariff,
        'platform_fee'         => $platformFeeApplied,
        'total_user_paid'      => $totalUserPaid,
        'share_landowner'      => $shareLandowner,
        'share_jukir'          => $shareJukir,
        'platform_commission'  => $platformCommission,
        'share_platform'       => $sharePlatform,
        'used_ruangpass'       => false,
    ];
}

function logWalletTx(PDO $pdo, int $userId, ?int $bookingId, string $txType, int $amount, int $balanceAfter, string $description): void
{
    $stmt = $pdo->prepare(
        'INSERT INTO wallet_transactions (user_id, booking_id, tx_type, amount, balance_after, description)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([$userId, $bookingId, $txType, $amount, $balanceAfter, $description]);
}
