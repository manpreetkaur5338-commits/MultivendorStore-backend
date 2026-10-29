

# ==========================================
# MarketNest - Login and Role Testing
# ==========================================

$baseUrl = "http://localhost:5000/api/auth"

# Enter your CUSTOMER account details below
$body = @{
    email    = "[EMAIL_ADDRESS5]"
    password = "password12345"
} | ConvertTo-Json

Write-Host "`n========== LOGIN TEST ==========" -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod `
        -Uri "$baseUrl/login" `
        -Method Post `
        -ContentType "application/json" `
        -Body $body

    Write-Host "Login successful!" -ForegroundColor Green

    # Display login information without printing the token
    Write-Host "Success: $($response.success)"
    Write-Host "User: $($response.user.name)"
    Write-Host "Role: $($response.user.role)"

    $token = $response.token

    if ([string]::IsNullOrWhiteSpace($token)) {
        Write-Host "ERROR: Login did not return a token." -ForegroundColor Red
        exit
    }

    Write-Host "Token received successfully." -ForegroundColor Green
}
catch {
    Write-Host "LOGIN FAILED!" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message
    } else {
        Write-Host $_.Exception.Message
    }
    exit
}

# Authorization header used by protected APIs
$headers = @{
    Authorization = "Bearer $token"
}

Write-Host "`n========== PROFILE API ==========" -ForegroundColor Cyan

try {
    $profile = Invoke-RestMethod `
        -Uri "$baseUrl/profile" `
        -Method Get `
        -Headers $headers

    $profile | ConvertTo-Json -Depth 5
}
catch {
    Write-Host "Profile API failed." -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message
    } else {
        Write-Host $_.Exception.Message
    }
}

Write-Host "`n========== VENDOR API ==========" -ForegroundColor Cyan

try {
    $vendor = Invoke-RestMethod `
        -Uri "$baseUrl/vendor-test" `
        -Method Get `
        -Headers $headers

    $vendor | ConvertTo-Json -Depth 5
}
catch {
    Write-Host "Vendor API response:" -ForegroundColor Yellow
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message
    } else {
        Write-Host $_.Exception.Message
    }
}

Write-Host "`n========== CUSTOMER API ==========" -ForegroundColor Cyan

try {
    $customer = Invoke-RestMethod `
        -Uri "$baseUrl/customer-test" `
        -Method Get `
        -Headers $headers

    $customer | ConvertTo-Json -Depth 5
}
catch {
    Write-Host "Customer API response:" -ForegroundColor Yellow
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message
    } else {
        Write-Host $_.Exception.Message
    }
}

Write-Host "`n========== ADMIN API ==========" -ForegroundColor Cyan

try {
    $admin = Invoke-RestMethod `
        -Uri "$baseUrl/admin-test" `
        -Method Get `
        -Headers $headers

    $admin | ConvertTo-Json -Depth 5
}
catch {
    Write-Host "Admin API response:" -ForegroundColor Yellow
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message
    } else {
        Write-Host $_.Exception.Message
    }
}

Write-Host "`n========== TESTING FINISHED ==========" -ForegroundColor Cyan
