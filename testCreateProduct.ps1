$baseUrl = "http://localhost:5000/api/auth"

$email = Read-Host "Enter approved vendor email"
$password = Read-Host "Enter vendor password"

$loginBody = @{
    email = $email
    password = $password
} | ConvertTo-Json

$login = Invoke-RestMethod `
    -Uri "$baseUrl/login" `
    -Method POST `
    -ContentType "application/json" `
    -Body $loginBody

$token = $login.token

$productBody = @{
    name = "Test Vendor Product"
    price = 100
    description = "Testing MarketNest product creation"
    image = "https://example.com/product.jpg"
    category = "Test"
    stock = 10
} | ConvertTo-Json

Invoke-RestMethod `
    -Uri "http://localhost:5000/api/products" `
    -Method POST `
    -Headers @{ Authorization = "Bearer $token" } `
    -ContentType "application/json" `
    -Body $productBody