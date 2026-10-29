import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
    
    name:{ 
        type:String,
        required:true,
        trim:true
    },
    email:{
        type:String,
        required:true,
        trim:true,
        unique:true
    },
    password:{
        type:String,
        required:true
    },
    role:{
        type:String,
        enum:["vendor", "customer", "admin"],
        default:"customer"
    },
    phone:{
        type:String,
        default:""
    },
    address:{
        type:String,
        default:""
    },
    city:{
        type:String,
        default:""
    },
    state:{
        type:String,
        default:""
    },
    zip:{
        type:String,
        default:""
    },
    country:{
        type:String,
        default:"India"
    },
    isVerified:{
        type:Boolean,
        default:false
    },
    isApproved:{
        type:Boolean,
        default:false
    }
  
    
    
} , {timestamps:true});
export default mongoose.model("User",UserSchema);