@echo off
cd /d "%~dp0"
echo Dang phat hien ma nguon tai thu muc: %CD%
echo Dang dong bo ma nguon len GitHub...
git add .
git commit -m "Feature: Nhac gia han tu dong 9h sang - bot bao truoc 1 ngay khi don sap het han"
git push
echo Hoan thanh day ma nguon len GitHub! Nhan phim bat ky de thoat.
pause
