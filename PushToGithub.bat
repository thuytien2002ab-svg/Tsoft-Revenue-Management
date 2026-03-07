@echo off
cd /d "%~dp0"
echo Dang phat hien ma nguon tai thu muc: %CD%
echo Dang dong bo ma nguon len GitHub...
git add .
git commit -m "Feature: N emails + goi k ro -> N DM rieng cho owner + validate email sai dinh dang"
git push
echo Hoan thanh day ma nguon len GitHub! Nhan phim bat ky de thoat.
pause
