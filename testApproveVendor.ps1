# MarketNest - Admin Vendor Approval Test

$baseUrl = "http://localhost:5000/api/auth"

# Enter your ADMIN account credentials
$loginBody = @{
    email    = "manpreetkaur5338@gmail.com"
    password = "MarketNest2026"
} | ConvertTo-Json

# Step 1: Login as admin
try {
    $loginResponse = Invoke-RestMethod `
        -Uri "$baseUrl/login" `
        -Method Post `
        -ContentType "application/json" `
        -Body $loginBody

    $token = $loginResponse.token

    if ([string]::IsNullOrWhiteSpace($token)) {
        Write-Host "Login did not return a token."
        exit
    }

    Write-Host "Admin login successful."
}
catch {
    Write-Host "Admin login failed."
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message
    }
    exit
}

# Step 2: Enter the vendor's MongoDB document ID
$vendorId = "6adeb630987489819e3676ad"

# Step 3: Approve the vendor
try {
    $headers = @{
        Authorization = "Bearer $token"
    }

    $result = Invoke-RestMethod `
        -Uri "$baseUrl/approve-vendor/$vendorId" `
        -Method Patch `
        -Headers $headers

    $result | ConvertTo-Json -Depth 5
}
catch {
    Write-Host "Vendor approval failed."
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message
    } else {
        Write-Host $_.Exception.Message
    }
}