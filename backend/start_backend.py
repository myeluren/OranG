import subprocess
import os

# 切换到后端目录
os.chdir(r'D:\AI code\04 智能投标V2\backend')

# 启动 uvicorn
subprocess.Popen([
    r'D:\python\python.exe',
    '-m', 'uvicorn',
    'app.main:app',
    '--host', '0.0.0.0',
    '--port', '8002'
])
print("Backend started")
