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

### Advanced Analytics Engines
- **ReserveEngine**: ML-enhanced reserve allocation with confidence scoring
- **PacingEngine**: Market-aware deployment pacing strategies  
- **CohortEngine**: Vintage cohort analysis and performance benchmarking (scaffolded)

### Technical Features
- **Modern Stack**: React + TypeScript + Express.js
- **Database**: PostgreSQL with Drizzle ORM
- **Charts**: Nivo + Recharts for advanced data visualization
- **UI**: Shadcn/ui components with Tailwind CSS
- **State Management**: TanStack Query for server state
- **Testing**: Vitest with comprehensive test coverage (74 tests)
- **Performance**: Memoized chart components and optimized rendering
- **API Documentation**: Full OpenAPI 3.0 specification

## 📁 Project Structure

```
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   │   └── charts/     # Advanced chart components (Nivo + Recharts)
│   │   ├── core/           # Analytics engines
│   │   │   ├── reserves/   # ReserveEngine for allocation strategies
│   │   │   ├── pacing/     # PacingEngine for deployment pacing
│   │   │   └── cohorts/    # CohortEngine for vintage analysis
│   │   ├── pages/          # Application pages/routes
│   │   ├── hooks/          # Custom React hooks (type-safe)
│   │   ├── lib/            # Utility libraries
│   │   └── utils/          # Utility functions
├── server/                 # Backend Express.js application
│   ├── index.ts           # Server entry point
│   ├── routes.ts          # Type-safe API route definitions
│   ├── storage.ts         # Data storage layer
│   └── vite.ts            # Vite development server setup
├── shared/                 # Shared types and schemas
│   ├── schema.ts          # Database schema definitions
│   └── types.ts           # Comprehensive Zod schemas & TypeScript types
├── tests/                  # Comprehensive test suite
│   ├── api/               # Engine and API tests
│   └── performance/       # Chart performance tests
├── docs/                   # Documentation
│   └── openapi.yaml       # Complete API specification
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

The application supports several environment variables for configuration and feature flags:

**Database Configuration:**
- `DATABASE_URL` - PostgreSQL connection string (optional)
- `NODE_ENV` - Environment setting (development/production/test)

**Analytics Engine Feature Flags:**
- `ALG_RESERVE=true` - Enable ML-enhanced reserve allocation engine
- `ALG_PACING=true` - Enable ML-optimized deployment pacing engine  
- `ALG_COHORT=true` - Enable ML-enhanced cohort analysis engine

**Example .env file:**
```bash
# Database (optional - falls back to in-memory storage)
DATABASE_URL=postgresql://username:password@localhost:5432/povc_fund_db

# Environment
NODE_ENV=development

# Analytics Engine Feature Flags (optional - defaults to rule-based)
ALG_RESERVE=true
ALG_PACING=true
ALG_COHORT=true
```

**Note:** When `NODE_ENV=development`, all analytics engines default to their enhanced ML modes for testing and development purposes.

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
- `npm run start` - Start production server
- `npm run check` - Run TypeScript type checking
- `npm test` - Run test suite with Vitest
- `npm run test:ui` - Run tests with UI dashboard
- `npm run test:run` - Run tests once (CI mode)
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

## 🔌 API Reference

### Analytics Engines API

The application provides three powerful analytics engines accessible via RESTful API:

#### Reserve Engine
**Endpoint:** `GET /api/reserves/:fundId`

ML-enhanced reserve allocation engine with confidence scoring.

```bash
curl "http://localhost:3000/api/reserves/1"
```

**Response:** Returns `ReserveSummary` with allocation recommendations and confidence scores.

#### Pacing Engine  
**Endpoint:** `GET /api/pacing/summary?fundSize=100000000&deploymentQuarter=1&marketCondition=bull`

Market-aware deployment pacing strategies across quarters.

```bash
curl "http://localhost:3000/api/pacing/summary?fundSize=50000000&marketCondition=neutral"
```

**Response:** Returns `PacingSummary` with quarterly deployment schedule.

#### Cohort Engine (Scaffolded)
**Endpoint:** `GET /api/cohorts/analysis?fundId=1&vintageYear=2022&cohortSize=15`

Vintage cohort analysis and performance benchmarking.

```bash
curl "http://localhost:3000/api/cohorts/analysis?vintageYear=2023&cohortSize=20"
```

**Response:** Returns `CohortSummary` with vintage performance analysis.

### Complete API Documentation
Full OpenAPI 3.0 specification available at: [`/docs/openapi.yaml`](./docs/openapi.yaml)

The spec includes:
- All 20+ API endpoints with full documentation
- Comprehensive request/response schemas
- Input validation rules and error responses
- Authentication schemes (ready for future implementation)
- Interactive API testing capabilities

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