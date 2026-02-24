@echo off
cd /d "%~dp0"
echo Dang phat hien ma nguon tai thu muc: %CD%
echo Dang dong bo ma nguon len GitHub...
git add .
git commit -m "Fix: loai don hoan khoi doi soat cong no va Top3 Dai ly; sua xep hang Top3 theo Gross; sua cong thuc topAgents va getDailyDebts"
git push
echo Hoan thanh day ma nguon len GitHub! Nhan phim bat ky de thoat.
pause
