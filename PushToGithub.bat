@echo off
cd /d "%~dp0"
echo Dang phat hien ma nguon tai thu muc: %CD%
echo Dang dong bo ma nguon len GitHub...
git add .
git commit -m "Fix: Ky luc doanh thu va Ngay bung no dung Gross, loai don hoan; sua revenueRecords useMemo"
git push
echo Hoan thanh day ma nguon len GitHub! Nhan phim bat ky de thoat.
pause
