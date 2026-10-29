import "dotenv/config";
import bcrypt from "bcryptjs";
import User from "./model/User.js";
import mongoose from "mongoose";


const createAdmin = async()=>{
    try {
        await mongoose.connect(process.env.MONGOURI)
        console.log(" MongoDB connected")
        const adminEmail = "manpreetkaur5338@gmail.com" ;
        const adminPassword ="MarketNest2026";
      

        const existingAdmin = await User.findOne({ email: adminEmail })
        if(existingAdmin){
            existingAdmin.role = "admin"
         existingAdmin.isApproved = true;
         existingAdmin.password = await bcrypt.hash(adminPassword,10);
         existingAdmin.country = "India"
         existingAdmin.state = "punjab"
         existingAdmin.city = "amritsar"
         existingAdmin.zip = "143302"
         existingAdmin.address = "MarketNest Admin Office"
         existingAdmin.phone = "9088090938"
         await existingAdmin.save();
        
            console.log("Existing account changed to admin successfully");
            console.log("Email:", existingAdmin.email);
            console.log("password : ",existingAdmin.password);
            console.log("updated role: ", existingAdmin.role);
            console.log("Admin is now approved and can login")
            return;
        }


        // create admin
        const hashedPassword = await bcrypt.hash(adminPassword,10)
        const admin = await User.create({
            name:"Admin",
            email:adminEmail,
            password:hashedPassword,
            role:"admin",
            country:"India",
            state:"punjab",
            city:"amritsar",
            zip:"143302",
            address:"MarketNest Admin Office",
            phone:"9088090938",
        });
        console.log("Admin created successfully:",admin.name);
        console.log("Admin email:",adminEmail);
      console.log("Use the configured admin email and password to login");
    } catch (error) {
        console.error("Admin creation failed:",error.message);
    } finally {
        await mongoose.disconnect();
    }
};
 createAdmin();