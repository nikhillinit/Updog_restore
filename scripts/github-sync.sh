#!/bin/bash
# GitHub Auto-Sync Script for UpDawg Repository

echo "🔗 Setting up GitHub Auto-Sync for UpDawg Repository"

# Repository configuration
REPO_URL="https://github.com/nikhillinit/UpDawg.git"
BRANCH="main"

# Initialize git if not already done
if [ ! -d ".git" ]; then
    echo "📁 Initializing Git repository..."
    git init
    git remote add origin $REPO_URL
fi

# Function to sync changes to GitHub
sync_to_github() {
    echo "⬆️ Syncing changes to GitHub..."
    git add .
    git commit -m "Auto-sync: $(date '+%Y-%m-%d %H:%M:%S') - AI improvements and debugging"
    git push origin $BRANCH
}

# Function to pull changes from GitHub  
sync_from_github() {
    echo "⬇️ Pulling latest changes from GitHub..."
    git fetch origin
    git merge origin/$BRANCH
}

# Set up auto-sync hooks
echo "🔧 Setting up auto-sync hooks..."

# Create pre-commit hook for automatic syncing
cat > .git/hooks/pre-commit << EOF
#!/bin/bash
echo "🚀 Auto-sync triggered before commit"
# Add any pre-sync validations here
EOF

chmod +x .git/hooks/pre-commit

echo "✅ GitHub Auto-Sync setup complete!"
echo "📡 Repository: $REPO_URL"
echo "🌿 Branch: $BRANCH"