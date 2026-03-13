@echo off
cd /d D:\AI code\04 智能投标V2\backend
set DATABASE_URL=mysql+aiomysql://bidai:bidai2026@localhost:3306/bidai
set REDIS_URL=redis://localhost:6379/0
D:\python\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
