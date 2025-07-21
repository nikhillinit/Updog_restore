# Team Setup Guide

This guide will help your team members get the POVC Fund Model application running locally and understand the codebase.

## 🚀 Quick Setup for Team Members

### 1. Prerequisites Check
Ensure each team member has:
```bash
# Check Node.js version (18+ required)
node --version

# Check npm version
npm --version

# Check Git
git --version
```

### 2. Repository Setup

#### Option A: Clone from GitHub (Recommended)
```bash
# Clone the repository
git clone https://github.com/nikhillinit/UpDawg.git
cd UpDawg

# Install dependencies
npm install

# Start development server
npm run dev
```

#### Option B: Download and Setup
1. Download the project files
2. Extract to your preferred directory
3. Run setup commands:
```bash
npm install
npm run dev
```

### 3. Verify Installation
- Open browser to `http://localhost:5000`
- You should see the POVC Fund Model dashboard
- Navigate through all sections to ensure everything works

## 👥 Team Collaboration Workflow

### Branch Strategy
```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make changes and commit
git add .
git commit -m "Add: specific feature description"

# Push to remote
git push origin feature/your-feature-name

# Create pull request on GitHub
```

### Development Workflow
1. **Start with issues**: Create GitHub issues for tasks
2. **Branch per feature**: One feature branch per team member
3. **Regular commits**: Commit frequently with clear messages
4. **Code review**: All changes go through pull requests
5. **Testing**: Test changes across all modules before merging

## 🏗 Codebase Overview for New Team Members

### Project Structure Deep Dive

```
├── client/src/
│   ├── components/
│   │   ├── charts/           # Recharts components
│   │   ├── dashboard/        # Dashboard-specific components
│   │   ├── layout/           # Header, sidebar, navigation
│   │   ├── portfolio/        # Portfolio management components
│   │   └── ui/               # Shadcn/ui base components
│   ├── pages/
│   │   ├── dashboard.tsx     # Main dashboard page
│   │   ├── fund-setup.tsx    # Fund configuration
│   │   ├── portfolio.tsx     # Portfolio management
│   │   ├── financial-modeling.tsx  # Financial projections
│   │   ├── analytics.tsx     # Performance analytics
│   │   └── reports.tsx       # Report generation
│   ├── hooks/
│   │   ├── use-fund-data.ts  # Data fetching hooks
│   │   └── use-toast.ts      # Toast notifications
│   └── types/
│       └── fund.ts           # Frontend type definitions
├── server/
│   ├── index.ts              # Express server setup
│   ├── routes.ts             # API route definitions
│   └── storage.ts            # In-memory data storage
└── shared/
    └── schema.ts             # Database schema & types
```

### Key Technologies Your Team Should Know

#### Frontend Stack
- **React 18**: Functional components with hooks
- **TypeScript**: Full type safety across the app
- **Tailwind CSS**: Utility-first CSS framework
- **Shadcn/ui**: Pre-built component library
- **TanStack Query**: Server state management
- **Recharts**: Chart and data visualization
- **Wouter**: Lightweight routing

#### Backend Stack
- **Express.js**: Web framework for Node.js
- **TypeScript**: Type-safe backend development
- **Drizzle ORM**: Type-safe database operations
- **Zod**: Runtime type validation

### Development Patterns

#### Component Structure
```typescript
// components/dashboard/metric-card.tsx
interface MetricCardProps {
  title: string;
  value: string;
  change: string;
  icon: React.ComponentType;
}

export default function MetricCard({ title, value, change, icon: Icon }: MetricCardProps) {
  return (
    <Card>
      <CardContent>
        {/* Component implementation */}
      </CardContent>
    </Card>
  );
}
```

#### API Routes Pattern
```typescript
// server/routes.ts
app.get("/api/funds", async (req, res) => {
  try {
    const funds = await storage.getAllFunds();
    res.json(funds);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch funds" });
  }
});
```

#### Data Fetching Pattern
```typescript
// hooks/use-fund-data.ts
export function useFundData(fundId: number = 1) {
  return useQuery<DashboardSummary>({
    queryKey: ['/api/dashboard-summary', fundId],
    enabled: !!fundId,
  });
}
```

## 🎯 Common Development Tasks

### Adding a New Component
1. Create component in appropriate directory
2. Follow existing naming conventions
3. Add TypeScript interfaces for props
4. Use Tailwind CSS for styling
5. Export from index files if needed

### Adding a New API Endpoint
1. Define route in `server/routes.ts`
2. Add storage method in `server/storage.ts`
3. Update schema in `shared/schema.ts` if needed
4. Create frontend hook for data fetching
5. Test endpoint thoroughly

### Adding a New Page
1. Create page component in `client/src/pages/`
2. Add route in `client/src/App.tsx`
3. Update sidebar navigation if needed
4. Add to module configuration
5. Test navigation flow

### Styling Guidelines
```typescript
// Use Tailwind CSS classes
<div className="flex items-center space-x-4 p-6 bg-white rounded-lg shadow-sm">

// Use POVC custom classes for branding
<button className="povc-bg-primary text-white">

// Responsive design
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
```

## 🐛 Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Kill process on port 5000
npx kill-port 5000

# Or use different port
PORT=3000 npm run dev
```

#### Module Not Found Errors
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

#### TypeScript Errors
- Check `tsconfig.json` configuration
- Ensure all types are properly imported
- Use `// @ts-ignore` sparingly for quick fixes

#### Build Errors
```bash
# Clear cache and rebuild
rm -rf dist
npm run build
```

## 📚 Learning Resources

### For Frontend Developers
- [React 18 Documentation](https://react.dev/)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [Shadcn/ui Components](https://ui.shadcn.com/)
- [TanStack Query Guide](https://tanstack.com/query)

### For Backend Developers
- [Express.js Guide](https://expressjs.com/)
- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [Zod Validation](https://zod.dev/)

### For TypeScript
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [TypeScript Best Practices](https://typescript-eslint.io/rules/)

## 🔒 Security & Best Practices

### Code Quality
- Run TypeScript checks: `npx tsc --noEmit`
- Follow existing code patterns
- Write descriptive commit messages
- Add error boundaries for React components

### Data Handling
- Validate all inputs with Zod schemas
- Use TypeScript for compile-time safety
- Handle async operations properly
- Add proper error handling

### Performance
- Use React.memo for expensive components
- Implement proper loading states
- Optimize chart rendering
- Use efficient data structures

## 📞 Getting Help

### Team Communication
1. **GitHub Issues**: For bugs and feature requests
2. **Pull Request Reviews**: For code feedback
3. **Documentation**: Check README and code comments
4. **Pair Programming**: For complex features

### Escalation Path
1. Check existing documentation
2. Review similar implementations in codebase
3. Ask team members for guidance
4. Create detailed GitHub issue if stuck

---

Welcome to the POVC Fund Model development team! 🎉