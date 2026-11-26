<?php
/**
 * API Autentikasi Asli (Login, Registrasi, Profil, Logout) — Tanpa Bypass Demo
 * Password di-hash menggunakan BCRYPT (selaras UU PDP No. 27/2022)
 */
declare(strict_types=1);
require_once __DIR__ . '/../config/database.php';

$pdo = getDB();
$action = $_GET['action'] ?? ($_POST['action'] ?? 'me');

function fetchUserPayload(PDO $pdo, int $userId): array
{
    $stmt = $pdo->prepare(
        'SELECT id, role, name, phone, email, avatar_text, subtitle, default_plate, bank_info, wallet_balance, created_at
         FROM users WHERE id = ?'
    );
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    if (!$user) {
        return ['user' => null];
    }
    $user['id'] = (int)$user['id'];
    $user['wallet_balance'] = (int)$user['wallet_balance'];

    $rpStmt = $pdo->prepare(
        "SELECT id, price_paid, total_quota, remaining_quota, starts_at, expires_at, status
         FROM ruangpass_subscriptions
         WHERE user_id = ? AND status = 'ACTIVE' AND remaining_quota > 0 AND expires_at >= NOW()
         ORDER BY id DESC LIMIT 1"
    );
    $rpStmt->execute([$userId]);
    $rp = $rpStmt->fetch();

    $ruangPass = [
        'active'         => (bool)$rp,
        'id'             => $rp ? (int)$rp['id'] : null,
        'remainingQuota' => $rp ? (int)$rp['remaining_quota'] : 0,
        'totalQuota'     => $rp ? (int)$rp['total_quota'] : RP_RUANGPASS_QUOTA,
        'validUntil'     => $rp ? date('d M Y', strtotime($rp['expires_at'])) : '30 Hari',
    ];

    $bmStmt = $pdo->prepare('SELECT spot_id FROM bookmarks WHERE user_id = ?');
    $bmStmt->execute([$userId]);
    $bookmarks = array_map(fn($r) => (int)$r['spot_id'], $bmStmt->fetchAll());

    return [
        'user'      => $user,
        'ruangPass' => $ruangPass,
        'bookmarks' => $bookmarks,
    ];
}

try {
    if ($action === 'me') {
        if (empty($_SESSION['user_id'])) {
            jsonResponse(['ok' => true, 'authenticated' => false, 'user' => null]);
        }
        $payload = fetchUserPayload($pdo, (int)$_SESSION['user_id']);
        jsonResponse(['ok' => true, 'authenticated' => (bool)$payload['user']] + $payload);
    }

    if ($action === 'login') {
        $data = getJsonBody();
        $identifier = trim((string)($data['identifier'] ?? ''));
        $password   = (string)($data['password'] ?? '');

        if ($identifier === '' || $password === '') {
            jsonResponse(['ok' => false, 'message' => 'Nomor HP/email dan kata sandi/PIN wajib diisi.'], 422);
        }

        $cleanPhone = preg_replace('/[^0-9]/', '', $identifier);
        $stmt = $pdo->prepare('SELECT * FROM users WHERE phone = ? OR phone = ? OR email = ? LIMIT 1');
        $stmt->execute([$identifier, $cleanPhone, strtolower($identifier)]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            jsonResponse(['ok' => false, 'message' => 'Nomor HP/email atau PIN keamanan salah.'], 401);
        }

        session_regenerate_id(true);
        $_SESSION['user_id'] = (int)$user['id'];
        $_SESSION['user_role'] = $user['role'];

        $payload = fetchUserPayload($pdo, (int)$user['id']);
        jsonResponse(['ok' => true, 'message' => 'Selamat datang kembali, ' . $user['name'] . '!'] + $payload);
    }

    if ($action === 'register') {
        $data = getJsonBody();
        $name   = trim((string)($data['name'] ?? ''));
        $phone  = preg_replace('/[^0-9]/', '', (string)($data['phone'] ?? ''));
        $email  = strtolower(trim((string)($data['email'] ?? '')));
        $role   = strtoupper(trim((string)($data['role'] ?? 'DRIVER')));
        $detail = trim((string)($data['detail'] ?? ''));
        $pin    = trim((string)($data['pin'] ?? ''));

        if ($name === '' || strlen($phone) < 9) {
            jsonResponse(['ok' => false, 'message' => 'Nama lengkap dan nomor HP valid (min. 9 digit) wajib diisi.'], 422);
        }
        if (strlen($pin) < 6) {
            jsonResponse(['ok' => false, 'message' => 'PIN / Kata sandi minimal 6 karakter.'], 422);
        }
        if (!in_array($role, ['DRIVER', 'LANDOWNER', 'ATTENDANT'], true)) {
            $role = 'DRIVER';
        }
        if ($email === '') {
            $email = strtolower(preg_replace('/[^a-z0-9]/i', '.', $name)) . '.' . substr($phone, -4) . '@ruangparkir.id';
        }

        $chk = $pdo->prepare('SELECT id FROM users WHERE phone = ? OR email = ? LIMIT 1');
        $chk->execute([$phone, $email]);
        if ($chk->fetch()) {
            jsonResponse(['ok' => false, 'message' => 'Nomor HP atau email sudah terdaftar. Silakan masuk menggunakan akun Anda.'], 409);
        }

        $parts = preg_split('/\s+/', $name);
        $avatar = strtoupper(substr($parts[0], 0, 1) . (isset($parts[1]) ? substr($parts[1], 0, 1) : substr($parts[0], 1, 1)));
        $plate = ($role === 'DRIVER' && $detail !== '') ? strtoupper($detail) : 'N 1000 RP';
        $subtitle = match ($role) {
            'LANDOWNER' => 'Mitra Pemilik Lahan (' . ($detail ?: 'Lahan Komunitas') . ')',
            'ATTENDANT' => 'Petugas Juru Parkir Lapangan Resmi',
            default     => 'Pengemudi Terdaftar (Plat ' . $plate . ')',
        };

        $hash = password_hash($pin, PASSWORD_BCRYPT);
        $ins = $pdo->prepare(
            'INSERT INTO users (role, name, phone, email, password_hash, avatar_text, subtitle, default_plate, bank_info, wallet_balance)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)'
        );
        $ins->execute([
            $role, $name, $phone, $email, $hash, $avatar, $subtitle,
            $role === 'DRIVER' ? $plate : null,
            $role === 'LANDOWNER' ? ($detail ?: ('BCA (' . $name . ')')) : null,
        ]);
        $newId = (int)$pdo->lastInsertId();

        session_regenerate_id(true);
        $_SESSION['user_id'] = $newId;
        $_SESSION['user_role'] = $role;

        $payload = fetchUserPayload($pdo, $newId);
        jsonResponse(['ok' => true, 'message' => 'Pendaftaran berhasil! Akun Anda siap digunakan.'] + $payload, 201);
    }

    if ($action === 'update_profile') {
        $user = requireAuthUser($pdo);
        $data = getJsonBody();
        $name         = trim((string)($data['name'] ?? $user['name']));
        $defaultPlate = strtoupper(trim((string)($data['default_plate'] ?? ($user['default_plate'] ?? ''))));
        $bankInfo     = trim((string)($data['bank_info'] ?? ($user['bank_info'] ?? '')));
        $newPin       = trim((string)($data['new_pin'] ?? ''));

        if ($name === '') {
            jsonResponse(['ok' => false, 'message' => 'Nama lengkap tidak boleh kosong.'], 422);
        }

        if ($newPin !== '') {
            if (strlen($newPin) < 6) {
                jsonResponse(['ok' => false, 'message' => 'PIN baru minimal 6 karakter.'], 422);
            }
            $hash = password_hash($newPin, PASSWORD_BCRYPT);
            $pdo->prepare('UPDATE users SET name = ?, default_plate = ?, bank_info = ?, password_hash = ? WHERE id = ?')
                ->execute([$name, $defaultPlate ?: null, $bankInfo ?: null, $hash, $user['id']]);
        } else {
            $pdo->prepare('UPDATE users SET name = ?, default_plate = ?, bank_info = ? WHERE id = ?')
                ->execute([$name, $defaultPlate ?: null, $bankInfo ?: null, $user['id']]);
        }

        $payload = fetchUserPayload($pdo, $user['id']);
        jsonResponse(['ok' => true, 'message' => 'Perubahan profil berhasil disimpan ke database.'] + $payload);
    }

    if ($action === 'logout') {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
        }
        session_destroy();
        jsonResponse(['ok' => true, 'message' => 'Anda telah keluar dari sistem.']);
    }

    jsonResponse(['ok' => false, 'message' => 'Aksi autentikasi tidak dikenal.'], 400);
} catch (Throwable $e) {
    jsonResponse(['ok' => false, 'message' => 'Kesalahan server: ' . $e->getMessage()], 500);
}
