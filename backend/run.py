import os
os.environ["DATABASE_URL"] = "postgresql+asyncpg://bidai:bidai2026@localhost:5432/bidai"
os.environ["REDIS_URL"] = "redis://localhost:6379/0"

import uvicorn
if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8002, reload=True)
