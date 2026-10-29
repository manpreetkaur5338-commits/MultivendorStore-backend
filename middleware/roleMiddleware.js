const roleMiddleware = (...allowedRoles) =>{ 
    return (req,res,next)=>{
        if(!req.user)
      {
        return res.status(401).json({
            success: false,
            message: "Please log in first",
        });

            }
            if(!allowedRoles.includes(req.user.role))
            {
                return res.status(403).json({
                    success: false,
                    message: "access denied: insufficient permission",
                });
            }
            next();
    }
};
export default roleMiddleware;