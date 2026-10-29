import jwt from "jsonwebtoken";
const authMiddleware = (req , res , next) =>{
    try {
        const authHeader= req.headers.authorization;
        if(!authHeader || !authHeader.startsWith("Bearer ")){
            return res.status(401).json({error:"No token provided"});
        }
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token,process.env.JWTSECRET);
        req.user = {
            id:decoded.id,
            role:decoded.role
        };
        next();
    } catch (error) {
        return res.status(401).json({
            error:"invalid token"
    }) 
    }
};
export default authMiddleware;