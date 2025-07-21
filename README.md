# POVC Fund Model Application

A comprehensive venture capital fund modeling application built for Press On Ventures Capital (POVC). This web application provides tools for fund setup, portfolio management, financial forecasting, and advanced analytics with integrated chart generation capabilities.

## 🚀 Features

### Core Application Features
- **Fund Setup**: Configure fund parameters, management fees, carry structures
- **Portfolio Management**: Track investments, monitor performance, manage exits
- **Financial Modeling**: Cohort-based projections, reserve calculations, exit modeling
- **Analytics & Insights**: Advanced performance analytics with risk assessment
- **Reporting**: Comprehensive reports with Excel export capabilities
- **Dashboard**: Real-time visualization of fund performance metrics

### Technical Features
- **Modern Stack**: React + TypeScript + Express.js
- **Database**: PostgreSQL with Drizzle ORM
- **Charts**: Recharts for data visualization (25+ chart types capability)
- **UI**: Shadcn/ui components with Tailwind CSS
- **State Management**: TanStack Query for server state

## 📁 Project Structure

```
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Application pages/routes
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Utility libraries
│   │   ├── types/          # TypeScript type definitions
│   │   └── utils/          # Utility functions
├── server/                 # Backend Express.js application
│   ├── index.ts           # Server entry point
│   ├── routes.ts          # API route definitions
│   ├── storage.ts         # Data storage layer
│   └── vite.ts            # Vite development server setup
├── shared/                 # Shared types and schemas
│   └── schema.ts          # Database schema definitions
└── package.json           # Project dependencies
```

## 🛠 Installation & Setup

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Git

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/nikhillinit/UpDawg.git
   cd UpDawg
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:5000`

### Environment Variables
The application automatically detects and uses PostgreSQL when DATABASE_URL is available.

**Current Configuration:**
- `DATABASE_URL` - PostgreSQL connection string (configured)
- `NODE_ENV` - Environment setting (development/production)

The app will use PostgreSQL when DATABASE_URL is set, otherwise falls back to in-memory storage with sample data.

## 🎯 Usage

### Navigation
The application features a sidebar navigation with the following modules:

1. **Dashboard** - Fund overview with key metrics and performance charts
2. **Fund Setup** - Configure fund parameters and investment strategy  
3. **Portfolio** - Manage portfolio companies and track performance
4. **Financial Modeling** - Cohort analysis and financial projections
5. **Analytics** - Advanced performance insights and risk assessment
6. **Reports** - Generate comprehensive fund reports

### Key Workflows

#### Fund Management
1. Set up fund parameters in the Fund Setup module
2. Add portfolio companies through the Portfolio module
3. Track investments and performance metrics
4. Generate reports for stakeholders

#### Analytics & Reporting
1. View real-time performance metrics on the Dashboard
2. Analyze cohort performance in Financial Modeling
3. Deep-dive into analytics for insights
4. Export data and generate reports

## 🏗 Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and builds
- **UI Library**: Shadcn/ui components built on Radix UI
- **Styling**: Tailwind CSS with custom POVC branding
- **State Management**: TanStack Query for server state
- **Routing**: Wouter for lightweight client-side routing

### Backend Architecture  
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Database**: Currently in-memory storage (PostgreSQL ready)
- **ORM**: Drizzle ORM with type-safe queries
- **API Design**: RESTful API with typed routes

### Data Model
The application manages the following core entities:
- **Funds**: Fund information, size, fees, vintage year
- **Portfolio Companies**: Company details, sectors, stages, valuations
- **Investments**: Investment transactions and rounds
- **Fund Metrics**: Performance metrics (IRR, multiples, DPI)
- **Activities**: Fund activities and milestones

## 🔧 Development

### Available Scripts
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production  
- `npm run preview` - Preview production build
- `npm run db:push` - Push database schema changes (when using PostgreSQL)

### Development Workflow
1. The app runs on a single port (5000) serving both frontend and backend
2. Frontend hot reload is enabled via Vite
3. Backend restarts automatically on changes via tsx
4. TypeScript provides full type safety across the stack

### Code Style
- TypeScript strict mode enabled
- ESLint for code quality
- Prettier for consistent formatting
- Tailwind CSS for styling

## 📊 Sample Data

The application includes comprehensive sample data for Press On Ventures Fund I:
- Fund size: $100M with $67.5M deployed
- 3 portfolio companies across Fintech, Healthcare, and SaaS
- Performance metrics with 28.4% IRR
- Recent activities and fund milestones

## 🚀 Deployment

### Production Build
```bash
npm run build
```

### Deployment Options
1. **Replit Deployments** (Recommended)
   - Click the Deploy button in Replit
   - Automatic builds and hosting
   - Custom domain support available

2. **Traditional Hosting**
   - Build the application
   - Serve static files from `dist/public`
   - Run the Express server for API endpoints

## 🤝 Contributing

### Team Collaboration
1. **Fork the repository** or create feature branches
2. **Install dependencies** and start development server
3. **Make changes** following the established patterns
4. **Test thoroughly** across all modules
5. **Submit pull requests** with clear descriptions

### Development Guidelines
- Follow TypeScript best practices
- Use existing UI components from Shadcn/ui
- Maintain responsive design principles
- Add proper error handling
- Write clear, self-documenting code

## 📝 License

This project is proprietary software for Press On Ventures Capital.

## 📞 Support

For questions, issues, or feature requests:
- Create GitHub issues for bugs and feature requests
- Contact the POVC development team for urgent matters
- Review the documentation in the `/docs` directory

---

Built with ❤️ for Press On Ventures Capital