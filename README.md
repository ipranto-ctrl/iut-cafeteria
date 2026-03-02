🍔 IUT Smart Cafeteria System
DevSprint 2026 Hackathon Submission

An event-driven, microservices-based smart ordering system designed for the CSE Department cafeteria at the Islamic University of Technology (IUT). This system eliminates physical queues by allowing students to place orders, tracking real-time inventory, and notifying users via WebSockets when their food is ready.

🏗️ System Architecture
This project is built using a highly scalable, decoupled Microservices Architecture. It utilizes message brokers for asynchronous processing and in-memory data stores for high-speed inventory caching.

Frontend (Port 3000): Vanilla JS/HTML/CSS served via Nginx. Real-time DOM updates and WebSocket integrations.

Identity Provider (Port 3001): Handles student registration, login, JWT issuance, and secure bcrypt password hashing. Backed by PostgreSQL.

Stock Service (Port 3002): Manages cafeteria inventory. Uses PostgreSQL as the source of truth and Redis for high-speed caching. Includes a Chaos Engineering toggle for resilience testing.

Order Gateway (Port 3003): The secure API gateway. Validates JWTs and pushes incoming orders to the RabbitMQ queue.

Kitchen Queue (Port 3005): A background worker that pulls from RabbitMQ, simulates physical cooking time, and passes completed orders to the notification queue.

Notification Hub (Port 3004): Consumes completed orders from RabbitMQ and pushes real-time alerts to the specific student's browser via WebSockets (Socket.io).

Automated CI/CD Pipeline: Integrated GitHub Actions to automatically validate Docker container builds on every push, ensuring continuous integration and deployment stability.

💻 Tech Stack
Backend Runtime: Node.js & Express.js

Databases & Brokers: PostgreSQL (Relational DB), Redis (In-memory Cache), RabbitMQ (Message Broker)

Frontend: HTML5, CSS3, JavaScript, Nginx

DevOps: Docker, Docker Compose, GitHub Actions (CI/CD)

Testing: Jest, Supertest

🚀 Quick Start (Local Deployment)
This entire architecture is fully containerized. You do not need Node.js, PostgreSQL, or Redis installed on your local machine to run this project.

Prerequisites
Docker Desktop installed and running.

Git installed.

1. Clone & Run
Open your terminal and run the following commands to instantly bootstrap the databases, install dependencies, and launch all microservices:

Bash
git clone https://github.com/your-username/your-repo-name.git
cd your-repo-name
docker-compose up --build -d
(Note: The initial build may take 2-3 minutes as Docker downloads the necessary Node and Alpine Linux images).

2. Access the System
Once the terminal confirms all containers are Started, open your web browser:

🎓 Student Ordering Interface: http://localhost:3000

Create a new student account to place orders.

⚙️ Admin Command Center: http://localhost:3000/admin.html

Admin Password: AdminDevSprint2026

Use the dashboard to monitor microservice health, manually override live inventory stock, or trigger the Chaos Toggle to kill the Stock Service.

🧪 Automated Testing (CI/CD)
The project includes automated security and integrity tests to ensure the Order Gateway correctly validates JWT tokens before allowing access to the message broker.

To run the unit tests locally (requires Node.js):

Bash
cd order-gateway
npm install
npm test
Note: A GitHub Actions workflow is also configured to run these tests automatically on every push to the main branch.

🛑 Shutting Down
To safely stop the application and spin down the containers, run:

Bash
docker-compose down