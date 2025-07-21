# Contributing to POVC Fund Model

Thank you for contributing to the POVC Fund Model application! This guide will help you get started with contributing to the project.

## 🚀 Getting Started

### 1. Fork & Clone
```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/UpDawg.git
cd UpDawg

# Add upstream remote
git remote add upstream https://github.com/nikhillinit/UpDawg.git
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Start Development Server
```bash
npm run dev
```

## 🏗 Development Workflow

### Branch Naming Convention
- `feature/feature-name` - New features
- `fix/bug-description` - Bug fixes
- `docs/update-description` - Documentation updates
- `refactor/component-name` - Code refactoring
- `test/test-description` - Test additions/updates

### Example:
```bash
git checkout -b feature/portfolio-analytics
git checkout -b fix/chart-loading-issue
git checkout -b docs/api-documentation
```

### Commit Message Format
Use conventional commits format:

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```bash
git commit -m "feat(dashboard): add real-time fund metrics display"
git commit -m "fix(portfolio): resolve chart rendering issue on mobile"
git commit -m "docs(readme): update installation instructions"
```

## 📝 Code Style Guidelines

### TypeScript
- Use strict TypeScript configuration
- Always define interfaces for component props
- Use type imports when importing types only
- Prefer `interface` over `type` for object shapes

```typescript
// Good
interface FundMetricsProps {
  fundId: number;
  showDetails?: boolean;
}

// Import types
import type { Fund, PortfolioCompany } from '@shared/schema';
```

### React Components
- Use functional components with hooks
- Extract complex logic into custom hooks
- Use proper prop destructuring
- Add error boundaries for critical components

```typescript
// Good component structure
interface ComponentProps {
  title: string;
  data: Fund[];
  onUpdate?: (fund: Fund) => void;
}

export default function Component({ title, data, onUpdate }: ComponentProps) {
  const [loading, setLoading] = useState(false);
  
  // Component logic here
  
  return (
    <div className="p-4">
      {/* JSX here */}
    </div>
  );
}
```

### CSS/Styling
- Use Tailwind CSS utility classes
- Follow responsive design principles
- Use POVC custom classes for branding
- Maintain consistent spacing and colors

```typescript
// Good styling patterns
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
  <Card className="povc-bg-primary-light border-blue-200">
    <CardContent className="pt-6">
      {/* Content */}
    </CardContent>
  </Card>
</div>
```

### Backend Code
- Use async/await for asynchronous operations
- Implement proper error handling
- Validate inputs with Zod schemas
- Follow RESTful API conventions

```typescript
// Good API route structure
app.get("/api/funds/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid fund ID" });
    }
    
    const fund = await storage.getFund(id);
    if (!fund) {
      return res.status(404).json({ message: "Fund not found" });
    }
    
    res.json(fund);
  } catch (error) {
    console.error('Error fetching fund:', error);
    res.status(500).json({ message: "Internal server error" });
  }
});
```

## 🧪 Testing Guidelines

### Component Testing
- Test component rendering
- Test user interactions
- Test error states
- Mock external dependencies

### API Testing
- Test all API endpoints
- Test error conditions
- Validate response formats
- Test authentication/authorization

### Manual Testing Checklist
Before submitting a PR, test:
- [ ] All pages load correctly
- [ ] Navigation works between modules
- [ ] Charts render properly
- [ ] Forms submit successfully
- [ ] Error states display correctly
- [ ] Mobile responsiveness
- [ ] Data export functionality

## 📦 Adding New Features

### 1. Plan Your Feature
- Create a GitHub issue describing the feature
- Discuss implementation approach with team
- Break down into smaller tasks if needed

### 2. Implement Frontend
```typescript
// Add new component
export default function NewFeature() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['new-feature'],
    // ... query configuration
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div>
      {/* Feature implementation */}
    </div>
  );
}
```

### 3. Implement Backend
```typescript
// Add new API route
app.get("/api/new-feature", async (req, res) => {
  try {
    const data = await storage.getNewFeatureData();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch data" });
  }
});
```

### 4. Update Types
```typescript
// Add to shared/schema.ts
export interface NewFeature {
  id: number;
  name: string;
  // ... other properties
}

export const insertNewFeatureSchema = createInsertSchema(newFeatureTable);
export type InsertNewFeature = z.infer<typeof insertNewFeatureSchema>;
```

## 🐛 Bug Fix Process

### 1. Reproduce the Bug
- Create a minimal reproduction
- Document steps to reproduce
- Identify root cause

### 2. Fix Implementation
- Make minimal changes to fix the issue
- Add tests to prevent regression
- Update documentation if needed

### 3. Testing
- Verify fix resolves the issue
- Test related functionality
- Run full test suite

## 📋 Pull Request Process

### 1. Before Submitting
- [ ] Code follows style guidelines
- [ ] All tests pass
- [ ] Documentation is updated
- [ ] Changes are well-tested
- [ ] Commit messages follow convention

### 2. PR Description Template
```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Refactoring
- [ ] Other (please describe)

## Testing
- [ ] Unit tests added/updated
- [ ] Manual testing completed
- [ ] All existing tests pass

## Screenshots (if applicable)
Add screenshots of UI changes

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review of code completed
- [ ] Documentation updated
- [ ] Changes work across different browsers/devices
```

### 3. Review Process
- At least one team member must review
- Address all feedback before merging
- Update PR based on review comments
- Ensure CI/CD checks pass

## 🚀 Release Process

### Version Numbering
Follow semantic versioning (semver):
- MAJOR.MINOR.PATCH
- MAJOR: Breaking changes
- MINOR: New features (backward compatible)
- PATCH: Bug fixes

### Release Steps
1. Update version in package.json
2. Update CHANGELOG.md
3. Create release tag
4. Deploy to production
5. Monitor for issues

## ❓ Getting Help

### Resources
- Check existing documentation
- Review similar implementations in codebase
- Search GitHub issues for similar problems

### Asking for Help
1. **GitHub Discussions**: For general questions
2. **GitHub Issues**: For bug reports and feature requests
3. **Pull Request Comments**: For code-specific questions
4. **Team Chat**: For real-time discussions

### Issue Template
When creating issues, include:
- Clear description of problem/feature
- Steps to reproduce (for bugs)
- Expected vs actual behavior
- Environment details (browser, OS, etc.)
- Screenshots or error messages

## 🎯 Best Practices

### Performance
- Optimize component re-renders
- Use proper loading states
- Implement efficient data fetching
- Optimize chart rendering

### Accessibility
- Use semantic HTML elements
- Add proper ARIA labels
- Ensure keyboard navigation
- Maintain color contrast ratios

### Security
- Validate all inputs
- Sanitize user data
- Use HTTPS in production
- Keep dependencies updated

### Documentation
- Comment complex logic
- Update README for new features
- Document API changes
- Maintain changelog

Thank you for contributing to POVC Fund Model! Your contributions help make this application better for everyone.