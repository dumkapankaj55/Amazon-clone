# Amazon Clone – HTML, CSS, JavaScript & Node.js

A simple **Amazon-style e-commerce clone** built using **HTML, CSS, JavaScript** on the frontend and **Node.js (Express)** on the backend.  
Includes product listing, deals section, basic cart storage and JSON-based backend.

---

## 🖼 Project Preview


> _Tip: Replace the above image path with your actual screenshot (`assets/amazon-clone-home.png`)._

---

## ✨ Features

### 🛒 Frontend

- Amazon-like homepage: header, search bar, hero banner and product sections  
- Product cards with title, price, category and image  
- “Today’s Deals”/offer style products (marked as deals from backend data)  
- Basic cart functionality (items added and sent to backend snapshot API)  
- Contact / sign-in style forms (data stored via backend APIs)  
- Built with **pure HTML, CSS and vanilla JavaScript** (no framework)

### 🧠 Backend (Node + Express)

- Auto-generates **500 demo products** on first run and stores them in `data/products.json`
- JSON file based storage (acts as a simple database)

**Main API endpoints:**

- `GET /products` – list products  
  - Query params:  
    - `?q=` search by title/category  
    - `?category=` filter by category  
    - `?deal=true` only deals  
    - `?limit=&offset=` pagination

- `GET /products/:id` – get single product by ID  
- `POST /cart` – save latest cart snapshot  
- `GET /cart` – get last saved cart  
- `POST /contact` – save contact form  
- `POST /signin` – save basic user info  
- `POST /location` – log user/location data  
- `POST /gift` – save gift form data  
- `GET /health` – health check (`{ ok: true }`)

---

## 🛠 Tech Stack

**Frontend**

- HTML5  
- CSS3  
- JavaScript (ES6+, Fetch API, DOM)

**Backend**

- Node.js  
- Express.js  
- CORS  
- Node `fs` module for JSON storage

**Tools**

- VS Code  
- Git & GitHub

---

## 📁 Project Structure

```bash
Amazon-clone/
├── backend/
│   ├── server.js          # Express server and API routes
│   └── data/              # JSON storage (products, users, carts, etc.)
│
├── backend - Copy/        # Backup copy (not required in production)
│
├── frontend/
│   ├── amezone.html       # Main UI page
│   ├── style.css          # Styling
│   └── script.js          # Frontend logic & API calls
│
└── README.md
