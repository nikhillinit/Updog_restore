import { bench, describe } from 'vitest'
import { 
  forEachAsync, 
  mapAsync, 
  processAsync 
} from '../../client/src/utils/async-iteration'

// Test data generators
const createItems = (count: number) => Array.from({ length: count }, (_, i) => i)
const asyncProcessor = async (item: number) => {
  // Simulate async work
  await new Promise(resolve => setTimeout(resolve, 0))
  return item * 2
}
const asyncVoidProcessor = async (item: number) => {
  // Simulate async work for forEach/processAsync
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('Async Iteration Benchmarks', () => {
  describe('1k items', () => {
    const items1k = createItems(1000)
    
    bench('forEachAsync - 1k items', async () => {
      await forEachAsync(items1k, async (item) => {
        await asyncProcessor(item)
      })
    })
    
    bench('mapAsync parallel - 1k items', async () => {
      await mapAsync(items1k, asyncProcessor, { parallel: true })
    })
    
    bench('mapAsync sequential - 1k items', async () => {
      await mapAsync(items1k, asyncProcessor, { parallel: false })
    })
    
    bench('processAsync batched - 1k items', async () => {
      await processAsync(items1k, asyncVoidProcessor, { 
        parallel: true, 
        batchSize: 50 
      })
    })
  })

  describe('10k items', () => {
    const items10k = createItems(10000)
    
    bench('forEachAsync - 10k items', async () => {
      await forEachAsync(items10k, async (item) => {
        await asyncProcessor(item)
      })
    })
    
    bench('mapAsync parallel - 10k items', async () => {
      await mapAsync(items10k, asyncProcessor, { parallel: true })
    })
    
    bench('mapAsync sequential - 10k items', async () => {
      await mapAsync(items10k, asyncProcessor, { parallel: false })
    })
    
    bench('processAsync batched - 10k items', async () => {
      await processAsync(items10k, asyncVoidProcessor, { 
        parallel: true, 
        batchSize: 100 
      })
    })
  })

  describe('50k items', () => {
    const items50k = createItems(50000)
    
    bench('mapAsync parallel - 50k items', async () => {
      await mapAsync(items50k, asyncProcessor, { parallel: true })
    })
    
    bench('processAsync batched small - 50k items', async () => {
      await processAsync(items50k, asyncVoidProcessor, { 
        parallel: true, 
        batchSize: 100 
      })
    })
    
    bench('processAsync batched large - 50k items', async () => {
      await processAsync(items50k, asyncVoidProcessor, { 
        parallel: true, 
        batchSize: 500 
      })
    })
  })

  describe('Error handling performance', () => {
    const items = createItems(1000)
    const flakyProcessor = async (item: number) => {
      if (item % 10 === 0) {
        throw new Error(`Flaky error for item ${item}`)
      }
      return item * 2
    }

    bench('processAsync with continueOnError', async () => {
      await processAsync(items, async (item) => {
        if (item % 10 === 0) {
          throw new Error(`Flaky error for item ${item}`)
        }
        // void function for processAsync
      }, { 
        parallel: true, 
        continueOnError: true 
      })
    })
  })

  describe('Memory efficiency', () => {
    // Test with larger objects to measure memory impact
    const createLargeItems = (count: number) => 
      Array.from({ length: count }, (_, i) => ({
        id: i,
        data: 'x'.repeat(100), // 100 bytes per item
        metadata: { timestamp: Date.now(), index: i }
      }))

    const items5k = createLargeItems(5000)
    
    bench('mapAsync with large objects - 5k items', async () => {
      await mapAsync(items5k, async (item) => {
        return { ...item, processed: true }
      }, { parallel: true, batchSize: 200 })
    })
  })
})
