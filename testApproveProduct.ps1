$email = Read-Host "Enter admin email"
$password = Read-Host "Enter admin password"
$productId = Read-Host "Enter Product ID"

$loginBody = @{
    email = $email
    password = $password
} | ConvertTo-Json

try {
    $login = Invoke-RestMethod `
        -Uri "http://localhost:5000/api/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $loginBody

    if (-not $login.token) {
        Write-Host "Login failed: no token returned."
        exit 1
    }

    $result = Invoke-RestMethod `
        -Uri "http://localhost:5000/api/products/approve/$productId" `
        -Method PATCH `
        -Headers @{ Authorization = "Bearer $($login.token)" }

    $result | ConvertTo-Json -Depth 5
}
catch {
    Write-Host "Request failed:"
    Write-Host $_.ErrorDetails.Message
}