#!/usr/bin/env node

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

/**
 * Generate weekly BMAD effectiveness report
 * Aggregates metrics from the last 7 days of CI runs
 */
async function generateWeeklyReport() {
  console.log('📊 BMAD Weekly Effectiveness Report');
  console.log('====================================');
  console.log(`Generated: ${new Date().toISOString()}`);
  console.log('');
  
  try {
    // Read all metrics files from .bmad directory
    const bmadDir = join(process.cwd(), '.bmad');
    const files = await readdir(bmadDir);
    const metricsFiles = files.filter(f => f.startsWith('metrics-') && f.endsWith('.json'));
    
    if (metricsFiles.length === 0) {
      console.log('No metrics files found. Run some repairs first!');
      return;
    }
    
    // Aggregate metrics
    const allMetrics = [];
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    for (const file of metricsFiles) {
      const data = JSON.parse(await readFile(join(bmadDir, file), 'utf8'));
      const timestamp = new Date(data.timestamp).getTime();
      
      if (timestamp >= oneWeekAgo) {
        allMetrics.push(data);
      }
    }
    
    if (allMetrics.length === 0) {
      console.log('No metrics found for the past week.');
      return;
    }
    
    // Calculate totals and averages
    const totals = {
      repairs: 0,
      failures: 0,
      successful: 0,
      prsCreated: 0,
      timeSaved: 0,
      duration: 0,
    };
    
    const byRepo = {};
    const byDay = {};
    
    allMetrics.forEach(m => {
      totals.repairs += m.repairsAttempted;
      totals.failures += m.failuresFound;
      totals.successful += m.repairsSuccessful;
      totals.prsCreated += m.prCreated ? 1 : 0;
      totals.timeSaved += m.timeSavedSeconds;
      totals.duration += m.duration;
      
      // Group by repo
      if (!byRepo[m.repo]) {
        byRepo[m.repo] = {
          repairs: 0,
          successful: 0,
          failures: 0,
        };
      }
      byRepo[m.repo].repairs += m.repairsAttempted;
      byRepo[m.repo].successful += m.repairsSuccessful;
      byRepo[m.repo].failures += m.failuresFound;
      
      // Group by day
      const day = new Date(m.timestamp).toISOString().split('T')[0];
      if (!byDay[day]) {
        byDay[day] = {
          repairs: 0,
          successful: 0,
        };
      }
      byDay[day].repairs += m.repairsAttempted;
      byDay[day].successful += m.repairsSuccessful;
    });
    
    // Calculate success rate
    const successRate = totals.repairs > 0 
      ? (totals.successful / totals.repairs * 100).toFixed(1)
      : 0;
    
    // Print summary
    console.log('📈 Weekly Summary');
    console.log('-----------------');
    console.log(`Total Runs: ${allMetrics.length}`);
    console.log(`Failures Found: ${totals.failures}`);
    console.log(`Repairs Attempted: ${totals.repairs}`);
    console.log(`Repairs Successful: ${totals.successful}`);
    console.log(`Success Rate: ${successRate}%`);
    console.log(`PRs Created: ${totals.prsCreated}`);
    console.log(`Time Saved: ${Math.round(totals.timeSaved / 3600)} hours`);
    console.log(`Avg Repair Time: ${totals.repairs > 0 ? Math.round(totals.duration / totals.repairs / 1000) : 0} seconds`);
    console.log('');
    
    // Print by repository
    console.log('📦 By Repository');
    console.log('----------------');
    Object.entries(byRepo).forEach(([repo, stats]) => {
      const rate = stats.repairs > 0 
        ? (stats.successful / stats.repairs * 100).toFixed(1)
        : 0;
      console.log(`${repo}:`);
      console.log(`  Failures: ${stats.failures}`);
      console.log(`  Fixed: ${stats.successful}/${stats.repairs} (${rate}%)`);
    });
    console.log('');
    
    // Print daily trend
    console.log('📅 Daily Trend');
    console.log('--------------');
    const sortedDays = Object.keys(byDay).sort();
    sortedDays.forEach(day => {
      const stats = byDay[day];
      const rate = stats.repairs > 0 
        ? (stats.successful / stats.repairs * 100).toFixed(0)
        : 0;
      const bar = '█'.repeat(Math.round(stats.successful / 2)) || '·';
      console.log(`${day}: ${bar} ${stats.successful}/${stats.repairs} (${rate}%)`);
    });
    console.log('');
    
    // Calculate ROI
    const devHourRate = 150; // $/hour estimate
    const hoursS saved = totals.timeSaved / 3600;
    const dollarsSaved = hoursSaved * devHourRate;
    
    console.log('💰 ROI Estimate');
    console.log('---------------');
    console.log(`Developer Hours Saved: ${hoursSaved.toFixed(1)}`);
    console.log(`Estimated Value: $${dollarsSaved.toFixed(0)}`);
    console.log(`Efficiency Gain: ${successRate}% automation rate`);
    console.log('');
    
    // Recommendations
    console.log('🎯 Recommendations');
    console.log('------------------');
    
    if (successRate < 50) {
      console.log('⚠️  Success rate is below 50%. Consider:');
      console.log('   - Improving test stability');
      console.log('   - Updating repair patterns');
      console.log('   - Adding more specific repair rules');
    } else if (successRate < 80) {
      console.log('📊 Success rate is moderate. Consider:');
      console.log('   - Fine-tuning repair heuristics');
      console.log('   - Adding context-aware repairs');
    } else {
      console.log('✅ Excellent success rate! Consider:');
      console.log('   - Expanding to more test categories');
      console.log('   - Automating PR merges for high-confidence repairs');
    }
    
    if (totals.prsCreated < allMetrics.length / 2) {
      console.log('📝 Low PR creation rate. Consider enabling --draft-pr more often');
    }
    
    console.log('');
    console.log('---');
    console.log('Report complete. Share with team for visibility!');
    
    // Generate shareable summary
    const slackMessage = `
*BMAD Weekly Report* 📊
\`\`\`
Week of: ${sortedDays[0] || 'N/A'}
Repairs: ${totals.successful}/${totals.repairs} (${successRate}%)
Time Saved: ${Math.round(hoursSaved)} hours
Value: ~$${Math.round(dollarsSaved)}
\`\`\`
${successRate >= 80 ? '🎉 Great week!' : successRate >= 50 ? '📈 Steady progress' : '⚠️ Needs attention'}
    `.trim();
    
    console.log('');
    console.log('📢 Slack/Discord Message:');
    console.log(slackMessage);
    
  } catch (error) {
    console.error('Error generating report:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateWeeklyReport();
}