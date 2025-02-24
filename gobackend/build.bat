@echo off
echo Building Drone Dashboard for all platforms...

REM Create build directory if it doesn't exist
if not exist "build" mkdir build

REM Create a temporary file to track completion
set "LOCKFILE=%TEMP%\build-lock-%RANDOM%.txt"
type nul > "%LOCKFILE%"

REM Start all builds in parallel
echo Starting parallel builds...

REM Windows build
start /b cmd /c "set GOOS=windows&& set GOARCH=amd64&& go build -ldflags="-s -w" -trimpath -o build/drone-dashboard-windows-amd64.exe && echo Windows build complete. && echo done >> %LOCKFILE%"

REM Linux builds
start /b cmd /c "set GOOS=linux&& set GOARCH=amd64&& go build -ldflags="-s -w" -trimpath -o build/drone-dashboard-linux-amd64 && echo Linux amd64 build complete. && echo done >> %LOCKFILE%"
start /b cmd /c "set GOOS=linux&& set GOARCH=arm64&& go build -ldflags="-s -w" -trimpath -o build/drone-dashboard-linux-arm64 && echo Linux arm64 build complete. && echo done >> %LOCKFILE%"

REM macOS builds
start /b cmd /c "set GOOS=darwin&& set GOARCH=amd64&& go build -ldflags="-s -w" -trimpath -o build/drone-dashboard-macos-amd64 && echo macOS amd64 build complete. && echo done >> %LOCKFILE%"
start /b cmd /c "set GOOS=darwin&& set GOARCH=arm64&& go build -ldflags="-s -w" -trimpath -o build/drone-dashboard-macos-arm64 && echo macOS arm64 build complete. && echo done >> %LOCKFILE%"

REM Wait for all builds to complete by counting completion markers
:WAIT_LOOP
set /a count=0
for /f %%A in ('type "%LOCKFILE%"^|find /c "done"') do set /a count=%%A
if %count% lss 5 (
    timeout /t 1 /nobreak > nul
    goto WAIT_LOOP
)

REM Clean up the lock file
del "%LOCKFILE%"

echo All builds complete! Check the build directory for binaries. 