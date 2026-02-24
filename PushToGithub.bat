@echo off
cd /d "%~dp0"
echo Dang phat hien ma nguon tai thu muc: %CD%
echo Dang dong bo ma nguon len GitHub...
git add .
git commit -m "Admin: phan trang 20 item/trang tab Don hang & Dai ly; sua cong thuc Hoa hong = Gross-Net; them cot Loi nhuan cty, hang Tong cong, o Hoa hong summary bar"
git push
echo Hoan thanh day ma nguon len GitHub! Nhan phim bat ky de thoat.
pause
