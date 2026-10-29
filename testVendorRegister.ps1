$body = @{
    name = "test vendor2" 
    email = "[EMAIL_ADDRESS45]"
    password = "vendor12345"
    role = "vendor"
    country = "India"
    zip = "143302"
    phone = "9876543219"
    address = "128 Main St"
    city = "asr2"
    state = "pb"
} | ConvertTo-Json



Invoke-RestMethod -Uri "http://localhost:5000/api/auth/register" -Method Post -ContentType "application/json" -Body $body