@echo off
cd /d D:\AI code\04 智能投标V2\backend
D:\python\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8002
