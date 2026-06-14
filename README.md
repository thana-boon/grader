# 🧑‍💻 CodeGrader

An automated programming assignment grading system for Thai schools — teachers create assignments with test cases, students write and submit code directly in the browser, and the system executes and grades it automatically.

> Built with Next.js (App Router) + Prisma + MySQL, developed at Sukhon School.

---

## ✨ Features

### 👨‍🏫 Teacher
- Create and manage **assignments** per subject and class
- Define **test cases** — expected input/output pairs for automated grading
- Support multiple assignment types:
  - 🐍 **Python** — executed via [Piston API](https://github.com/engineer-man/piston)
  - 🐘 **PHP** — executed via Piston API
  - 🌐 **HTML** — evaluated via DOM inspection (cheerio)
  - 🐱 **Scratch** — parsed from `.sb3` file
- View per-student submission results and scores
- Export scores to Excel (SheetJS)
- Export submissions as zip (JSZip)

### 👨‍🎓 Student
- Login with **student ID + national ID** (bcrypt-hashed, PDPA-compliant)
- Write and run code directly in browser with **CodeMirror editor** (VS Code theme)
- Submit assignments and view grading results instantly
- See test case pass/fail breakdown per submission

### 🤖 Auto Grading
- Code is sent to **Piston API** for sandboxed execution
- Output is compared against teacher-defined expected output
- Pass/fail scored per test case
- Results stored and displayed immediately after submission

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| UI | RippleUI + Tailwind CSS |
| Code Editor | CodeMirror 6 (Python, PHP, HTML language modes) |
| ORM | Prisma 6 |
| Database | MySQL |
| Auth | JWT (jose) + bcrypt |
| Code Execution | Piston API (Python, PHP) |
| HTML Grading | Cheerio (DOM inspection) |
| Scratch Grading | .sb3 file parser |
| Export | SheetJS (Excel), JSZip (zip) |

---

## 📁 Project Structure

```
grader/
├── src/
│   ├── app/                    # Next.js App Router pages & API routes
│   │   ├── (auth)/             # Login pages (teacher / student)
│   │   ├── teacher/            # Teacher dashboard, assignments, submissions
│   │   ├── student/            # Student dashboard, assignment view, code editor
│   │   └── api/                # API routes (grading, auth, export)
│   ├── components/             # Shared UI components
│   └── lib/                    # Utilities (auth, piston, graders)
├── prisma/
│   ├── schema.prisma           # Database schema
│   └── seed.ts                 # Seed admin/teacher accounts
├── public/fonts/               # Custom fonts
├── .env.example
└── package.json
```

---

## ⚙️ How Auto Grading Works

```
Student submits code
       ↓
API route receives submission
       ↓
┌──────────────────────────────────────────┐
│  Python / PHP  →  Piston API (sandboxed) │
│  HTML          →  Cheerio DOM inspection │
│  Scratch       →  .sb3 JSON parser       │
└──────────────────────────────────────────┘
       ↓
Output compared against test cases
       ↓
Score calculated → saved to DB → shown to student
```

---

## 🔐 Authentication

| Role | Login Method |
|------|-------------|
| **Teacher** | Username + password (bcrypt) |
| **Student** | Student ID + National ID (bcrypt, PDPA-compliant) |

Sessions are managed with JWT via `jose` — no passwords stored in plain text.

---

## 🚀 Getting Started

### Requirements

- Node.js 18+
- MySQL 5.7+
- Internet access for Piston API (or self-hosted Piston instance)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/thana-boon/grader.git
   cd grader
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment:
   ```bash
   cp .env.example .env
   ```

   Edit `.env`:
   ```env
   DATABASE_URL="mysql://root:password@localhost:3306/codegrader"
   AUTH_SECRET="your_jwt_secret"
   PISTON_API_URL="https://emkc.org/api/v2/piston"
   ```

4. Push database schema:
   ```bash
   npm run db:push
   ```

5. Seed initial data:
   ```bash
   npm run db:seed
   ```

6. Start the development server:
   ```bash
   npm run dev
   ```

   App runs on `http://localhost:3000`

---

## 📄 License

This project is for educational and internal school use.

---

## 👤 Author

**thana-boon** — Teacher & Developer at Sukhon School  
GitHub: [@thana-boon](https://github.com/thana-boon)
