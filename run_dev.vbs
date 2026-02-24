Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c npm run dev > vite_log.txt 2>&1", 0, False
