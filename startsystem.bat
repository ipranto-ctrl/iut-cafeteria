@echo off
echo Waking up the IUT Cafeteria System...

:: Step 1: Start the Docker Infrastructure
cd /d G:\hackathon
docker compose up -d

:: Step 2: Launch all Microservices in separate windows
start cmd /k "title Identity Provider & cd /d G:\hackathon\identity-provider & node index.js"
start cmd /k "title Stock Service & cd /d G:\hackathon\stock-service & node index.js"
start cmd /k "title Order Gateway & cd /d G:\hackathon\order-gateway & node index.js"
start cmd /k "title Kitchen Queue & cd /d G:\hackathon\kitchen-queue & node index.js"
start cmd /k "title Notification Hub & cd /d G:\hackathon\notification-hub & node index.js"

:: Step 3: Launch the Frontend
start cmd /k "title Frontend UI & cd /d G:\hackathon\frontend & npx serve ."

echo All services are spinning up! You can close this window.