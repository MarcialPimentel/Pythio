<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$leaderboardFile = "leaderboard.json";

// Initialize leaderboard file if it doesn't exist
if (!file_exists($leaderboardFile)) {
    file_put_contents($leaderboardFile, json_encode([]));
}

$action = isset($_GET['action']) ? $_GET['action'] : '';

if ($action === "read") {
    // Read the leaderboard
    $leaderboard = json_decode(file_get_contents($leaderboardFile), true);
    echo json_encode($leaderboard);
} elseif ($action === "write" && $_SERVER['REQUEST_METHOD'] === "POST") {
    // Write to the leaderboard
    $data = json_decode(file_get_contents("php://input"), true);
    if ($data) {
        file_put_contents($leaderboardFile, json_encode($data));
        echo json_encode(["status" => "success"]);
    } else {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Invalid data"]);
    }
} else {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Invalid request"]);
}
?>