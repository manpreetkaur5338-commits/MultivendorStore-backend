$body = @{
    "name" = "manpreet kaur"
    "email" = "[EMAIL_ADDRESS5]"
    "password" = "password12345"
    "role" = "customer"
    "country" = "India"
    "zip" = "143302"
    "phone" = "9876543210"
    "address" = "125 Main St"
    "city" = "asr"
    "state" = "pb"
}| ConvertTo-Json;

Invoke-RestMethod -Uri "http://localhost:5000/api/auth/register" -Method Post -ContentType "application/json" -Body $body