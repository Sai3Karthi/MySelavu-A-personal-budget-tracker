import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values'; // Required for uuid
import { v4 as uuidv4 } from 'uuid';

// Define types for clarity
type BalanceType = 'gpay' | 'cash';
type TransactionPaymentMethod = BalanceType;

// Category Type (from DB)
type Category = {
  id: number;
  name: string;
  monthlyLimit: number | null; // Allow null for no limit
};

type Balance = {
  type: BalanceType;
  amount: number;
};

// Transaction Type (references categoryId, includes optional categoryName from JOIN)
type Transaction = {
  id: string;
  timestamp: number;
  paymentMethod: TransactionPaymentMethod;
  categoryId: number; 
  amount: number;
  reason: string | null;
  categoryName?: string; // Added for convenience after JOIN
};

// Data for creating a transaction
type NewTransactionData = {
  paymentMethod: TransactionPaymentMethod;
  categoryId: number; // Use categoryId now
  amount: number;
  reason?: string;
};

// Type for filtering transactions (expanded)
type TransactionFilters = {
  // dateRange?: 'all' | 'this_month' | 'last_month'; // Removed
  startDate?: Date | null;
  endDate?: Date | null;
  paymentMethod?: 'all' | TransactionPaymentMethod;
  category?: 'all' | string; // Filter by category name
  searchText?: string;
  year?: number;   // Keep for specific month/year filtering if needed elsewhere
  month?: number; // Keep for specific month/year filtering (1-12)
  limit?: number; // Keep for fetching recent transactions
};

// --- Database Initialization ---
// Use SQLiteDatabase instead of SQLiteDatabaseSync
let db: SQLite.SQLiteDatabase | null = null;
let initializationPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const DEFAULT_CATEGORIES = [
  { name: 'Uncategorized', limit: null },
  { name: 'Gain', limit: null },
  { name: 'Groceries', limit: null },
  { name: 'Transport', limit: null },
  { name: 'Bills', limit: null },
  { name: 'Entertainment', limit: null },
  { name: 'Other Expense', limit: null },
];

// Use SQLiteDatabase instead of SQLiteDatabaseSync
async function performInitialization(): Promise<SQLite.SQLiteDatabase> { 
  console.log("[DB] Starting database initialization process...");
  if (db) {
      console.log("[DB Init] Database already initialized (checked at start).");
      return db;
  }
  if (initializationPromise) {
      console.log("[DB Init] Initialization already in progress, returning existing promise.");
      return initializationPromise;
  }

  try {
    console.log("[DB Init] Attempting SQLite.openDatabaseSync...");
    // Use SQLiteDatabase type
    const openedDb: SQLite.SQLiteDatabase = SQLite.openDatabaseSync('budgetTracker.db'); 
    console.log(`[DB Init] SQLite.openDatabaseSync returned: ${typeof openedDb}`);

    // Basic check if object seems valid (methods exist) - adjust if needed based on actual API
    if (!openedDb || typeof openedDb.execAsync !== 'function') { 
        console.error("[DB Init] CRITICAL: SQLite.openDatabaseSync did not return a valid DB object.");
        throw new Error("SQLite.openDatabaseSync failed to return a valid database instance.");
    }
    console.log("[DB Init] Database opened successfully. Assigning to module variable.");
    db = openedDb;

    // ... rest of performInitialization, including table drops/creates/seeding ...
     // Log right before first use
    console.log(`[DB Init] 'db' variable type before first execAsync: ${typeof db}`);
    if (!db || typeof db.execAsync !== 'function') {
         console.error("[DB Init] CRITICAL: 'db' variable is invalid or lacks execAsync method right before use.");
         throw new Error("'db' variable is invalid before executing operations.");
    }

    console.log("[DB Init] Dropping existing tables for schema update (Dev Only)...");
    // Drop tables in reverse order of dependency if needed
    await db.execAsync(`
      DROP TABLE IF EXISTS transactions;
      DROP TABLE IF EXISTS categories;
      DROP TABLE IF EXISTS balances; 
    `);
    console.log("[DB Init] Tables dropped.");

    console.log("[DB Init] Creating tables with new schema...");
    // Log before create table exec
    console.log(`[DB Init] 'db' variable type before CREATE TABLE execAsync: ${typeof db}`);
    if (!db || typeof db.execAsync !== 'function') {
         console.error("[DB Init] CRITICAL: 'db' variable is invalid before CREATE TABLE.");
         throw new Error("'db' variable is invalid before CREATE TABLE.");
    }
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON; -- Enable foreign key enforcement

      CREATE TABLE categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        monthlyLimit REAL DEFAULT NULL
      );

      CREATE TABLE balances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT UNIQUE NOT NULL CHECK(type IN ('gpay', 'cash')),
        amount REAL NOT NULL DEFAULT 0.0
      );

      CREATE TABLE transactions (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        paymentMethod TEXT NOT NULL CHECK(paymentMethod IN ('gpay', 'cash')),
        categoryId INTEGER NOT NULL, -- References categories table
        amount REAL NOT NULL, 
        reason TEXT,
        FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE RESTRICT -- Prevent deleting category if used (adjust if needed)
      );
    `);
    console.log("[DB Init] Tables created successfully.");

    // Log before transaction block
    console.log(`[DB Init] 'db' variable type before manual transaction: ${typeof db}`);
    if (!db || typeof db.execAsync !== 'function' || typeof db.runAsync !== 'function') { // Check for runAsync too
         console.error("[DB Init] CRITICAL: 'db' variable is invalid or lacks methods before manual transaction.");
         throw new Error("'db' variable is invalid before starting manual transaction.");
    }
    
    // --- Manual Transaction for Seeding ---
    console.log("[DB Init] Beginning manual transaction for seeding...");
    await db.execAsync('BEGIN TRANSACTION;');
    try {
        // Re-enable seeding logic
        console.log("[DB Init] Seeding default categories...");
        for (const category of DEFAULT_CATEGORIES) {
            await db.runAsync( // Use db.runAsync directly within manual transaction
                'INSERT OR IGNORE INTO categories (name, monthlyLimit) VALUES (?, ?)',
                [category.name, category.limit]
            );
        }
        console.log("[DB Init] Default categories seeded.");

        console.log("[DB Init] Initializing balances...");
        await db.runAsync( // Use db.runAsync directly
            'INSERT OR IGNORE INTO balances (type, amount) VALUES (?, ?), (?, ?)',
            ['gpay', 0.0, 'cash', 0.0]
        );
        console.log("[DB Init] Initial balances ensured.");

        // If all succeeded, commit
        console.log("[DB Init] Committing manual transaction...");
        await db.execAsync('COMMIT;');
        console.log("[DB Init] Manual transaction committed successfully.");

    } catch (transactionError: any) {
        console.error("[DB Init] Error during manual seeding transaction, attempting rollback:", transactionError);
        try {
            await db.execAsync('ROLLBACK;');
            console.log("[DB Init] Manual transaction rolled back.");
        } catch (rollbackError) {
            console.error("[DB Init] CRITICAL: Rollback failed after transaction error:", rollbackError);
        }
        throw transactionError;
    }
    // --- End Manual Transaction ---
    
    // --- Add temporary logging to verify categories --- 
    try {
        console.log("[DB Init Verify] Verifying categories post-seeding...");
        const allCategories = await db.getAllAsync<Category>('SELECT * FROM categories');
        console.log("[DB Init Verify] Categories found:", JSON.stringify(allCategories, null, 2));
        const gainCategory = allCategories.find(c => c.name === 'Gain');
        if (gainCategory) {
            console.log("[DB Init Verify] 'Gain' category FOUND. ID:", gainCategory.id);
        } else {
            console.error("[DB Init Verify] CRITICAL: 'Gain' category NOT FOUND after seeding!");
        }
    } catch (verifyError) {
        console.error("[DB Init Verify] Error during category verification log:", verifyError);
    }
    // --- End temporary logging ---

    console.log('[DB] Database initialization and seeding complete');
    return db;

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[DB] CRITICAL Error during initialization/seeding: ${errorMessage}`, error);
    db = null;
    throw error;
  }
}

// Use SQLiteDatabase instead of SQLiteDatabaseSync
function ensureDbInitialized(): Promise<SQLite.SQLiteDatabase> {
  if (!initializationPromise) {
     try {
       console.log("[DB Ensure] Creating new initialization promise.");
       initializationPromise = performInitialization();
     } catch (syncError) {
        console.error("[DB Ensure] Synchronous error during performInitialization call:", syncError);
        initializationPromise = Promise.reject(syncError);
     }
  } else {
      initializationPromise.catch(() => {}); 
      console.log("[DB Ensure] Returning existing initialization promise.");
  }
  return initializationPromise;
}

// --- Helper to get the DB instance safely ---
// Use SQLiteDatabase instead of SQLiteDatabaseSync
async function getDbInstance(): Promise<SQLite.SQLiteDatabase> {
    try {
      console.log("[DB GetInstance] Awaiting ensureDbInitialized...");
      const initializedDb = await ensureDbInitialized();
      console.log(`[DB GetInstance] ensureDbInitialized resolved. DB type: ${typeof initializedDb}`);

      // More robust check including methods
      if (!initializedDb || typeof initializedDb.execAsync !== 'function' || typeof initializedDb.runAsync !== 'function') {
          console.error("[DB GetInstance] Initialization promise resolved but DB instance is still invalid or lacks methods.");
          throw new Error("Database initialization failed or returned invalid instance.");
      }
      console.log("[DB GetInstance] DB instance appears valid.");
      return initializedDb;
    } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (!errorMessage.includes('[DB] CRITICAL')) {
             console.error(`[DB GetInstance] Failed to get DB instance due to initialization error: ${errorMessage}`, error);
        }
        throw new Error(`Database is not available: ${errorMessage}`);
    }
}

// --- Balance Functions ---

// Get a specific balance
async function getBalance(type: BalanceType): Promise<number | null> {
  try {
    const currentDb = await getDbInstance(); 
    const result = await currentDb.getFirstAsync<{ amount: number }>(
      'SELECT amount FROM balances WHERE type = ?',
      [type]
    );
    return result?.amount ?? 0;
  } catch (error) {
    console.error(`[DB] Error getting ${type} balance:`, error);
    return null;
  }
}

// Get all balances
async function getAllBalances(): Promise<{ gpay: number; cash: number } | null> {
  try {
    const currentDb = await getDbInstance();
    const allRows = await currentDb.getAllAsync<Balance>('SELECT type, amount FROM balances');
    // Add explicit types to reduce parameters
    const balances = allRows.reduce((acc: { [key in BalanceType]?: number }, row: Balance) => {
      acc[row.type] = row.amount;
      return acc;
    }, {} as { [key in BalanceType]?: number });

    return {
        gpay: balances.gpay ?? 0,
        cash: balances.cash ?? 0
    };
  } catch (error) {
    console.error('[DB] Error getting all balances:', error);
    return null;
  }
}

// Update a specific balance
async function updateBalance(type: BalanceType, newAmount: number): Promise<boolean> {
  try {
    const currentDb = await getDbInstance(); 
    const result = await currentDb.runAsync(
      'UPDATE balances SET amount = ? WHERE type = ?',
      [newAmount, type]
    );
    console.log(`[DB] Updated ${type} balance to ${newAmount}`);
    return (result.changes ?? 0) > 0;
  } catch (error) {
    console.error(`[DB] Error updating ${type} balance:`, error);
    throw error; 
  }
}

// --- End Balance Functions ---

// --- Category CRUD Functions ---

// Get ID of the 'Gain' category
async function getGainCategoryId(): Promise<number | null> {
  try {
    const currentDb = await getDbInstance();
    const result = await currentDb.getFirstAsync<{ id: number }>(
      `SELECT id FROM categories WHERE name = 'Gain'`
    );
    if (!result) {
      console.warn("[DB] 'Gain' category not found.");
      return null;
    }
    return result.id;
  } catch (error: any) {
    console.error(`[DB] Error fetching Gain category ID: ${error.message}`, error);
    return null;
  }
}

async function getAllCategories(): Promise<Category[]> {
    try {
        const currentDb = await getDbInstance();
        const results = await currentDb.getAllAsync<Category>('SELECT * FROM categories ORDER BY name ASC');
        return results ?? [];
    } catch (error) {
        console.error("[DB] Error fetching categories:", error);
        return [];
    }
}

async function addCategory(name: string, limit: number | null = null): Promise<Category | null> {
    // Use SQLiteDatabase type if needed here, though runAsync is likely on base type
    try {
        const currentDb = await getDbInstance();
        const trimmedName = name?.trim();
        if (!trimmedName) { throw new Error("Category name cannot be empty."); }
        if (trimmedName.toLowerCase() === 'all') { throw new Error("Cannot add category named 'All'."); }

        const result = await currentDb.runAsync(
            'INSERT INTO categories (name, monthlyLimit) VALUES (?, ?)',
            [trimmedName, limit]
        );
        if (result.lastInsertRowId) {
             const newCategory = await currentDb.getFirstAsync<Category>(
                 'SELECT * FROM categories WHERE id = ?', 
                 [result.lastInsertRowId]
             );
             return newCategory ?? null;
        } else {
            console.warn(`[DB] Failed to add category, name likely exists: ${name}`);
            return null; // Indicate failure, not necessarily an error
        }
    } catch (error) {
        console.error(`[DB] Error adding category \"${name}\":`, error); // Use name before trim
        // Re-throw or handle specific errors (like UNIQUE constraint) if needed
        // For now, return null to indicate failure
        return null;
    }
}

// Use SQLiteDatabase if needed
async function updateCategory(id: number, name: string, limit: number | null): Promise<boolean> {
    try {
        const currentDb = await getDbInstance();
        const trimmedName = name?.trim();
        if (!trimmedName) { throw new Error("Category name cannot be empty for update."); }
        if (trimmedName.toLowerCase() === 'all') { throw new Error("Cannot rename category to 'All'."); }

        const result = await currentDb.runAsync(
            'UPDATE categories SET name = ?, monthlyLimit = ? WHERE id = ?',
            [trimmedName, limit, id]
        );
        return (result.changes ?? 0) > 0;
    } catch (error) {
        console.error(`[DB] Error updating category ID ${id}:`, error);
        return false;
    }
}

// Use SQLiteDatabase if needed
async function deleteCategory(id: number): Promise<boolean> {
     console.warn(`[DB] Attempting to delete category ID ${id}. This will fail if transactions reference it.`);
    try {
        const currentDb = await getDbInstance();
        const result = await currentDb.runAsync('DELETE FROM categories WHERE id = ?', [id]);
        if ((result.changes ?? 0) > 0) {
            console.log(`[DB] Deleted category ID ${id}`);
            return true;
        }
        console.log(`[DB] Category ID ${id} not found or delete failed.`);
        return false;
    } catch (error) {
        console.error(`[DB] Error deleting category ID ${id}:`, error); // Likely FK constraint error
        return false;
    }
}

// --- End Category CRUD ---

// --- Transaction Functions ---

// Use SQLiteDatabase if needed
async function addTransaction(data: NewTransactionData): Promise<Transaction | null> {
  const newId = uuidv4();
  const timestamp = Date.now();

  let currentDb: SQLite.SQLiteDatabase | null = null; // Use SQLiteDatabase type
  try {
    currentDb = await getDbInstance();
    await currentDb.execAsync('BEGIN TRANSACTION;');

    // ... rest of addTransaction logic ...
     // 1. Fetch category details (needed for gain check)
    const categoryDetails = await currentDb.getFirstAsync<Category>(
      'SELECT name FROM categories WHERE id = ?', 
      [data.categoryId]
    );
    if (!categoryDetails) {
      throw new Error(`Category with ID ${data.categoryId} not found.`);
    }
    const isGain = categoryDetails.name.toLowerCase() === 'gain'; // Assuming 'Gain' is the specific name

    // 2. Get current balance
    const currentBalanceResult = await currentDb.getFirstAsync<{ amount: number }>(
      'SELECT amount FROM balances WHERE type = ?',
      [data.paymentMethod]
    );
    const currentBalance = currentBalanceResult?.amount ?? 0;

    // 3. Calculate new balance (based on fetched category)
    const newBalance = isGain ? (currentBalance + data.amount) : (currentBalance - data.amount);
    
    // Check balance before proceeding with expense
    /* // Temporarily disabling balance check for adding transactions
     if (!isGain && newBalance < 0) { 
         throw new Error(`Insufficient ${data.paymentMethod} balance for this transaction.`);
     }
    */

    // 4. Update balance (use runAsync directly on db)
    const updateResult = await currentDb.runAsync(
        'UPDATE balances SET amount = ? WHERE type = ?',
        [newBalance, data.paymentMethod]
    );
     if ((updateResult.changes ?? 0) === 0) { 
         throw new Error(`Failed to update ${data.paymentMethod} balance.`); 
     }

    // 5. Insert transaction
    await currentDb.runAsync(
      'INSERT INTO transactions (id, timestamp, paymentMethod, categoryId, amount, reason) VALUES (?, ?, ?, ?, ?, ?)',
      [
        newId,
        timestamp,
        data.paymentMethod,
        data.categoryId,
        data.amount,
        data.reason ?? null,
      ]
    );

    await currentDb.execAsync('COMMIT;');
    
    // Return a representation of the added transaction
    return { 
        id: newId, 
        timestamp, 
        paymentMethod: data.paymentMethod, 
        categoryId: data.categoryId, 
        amount: data.amount, 
        reason: data.reason ?? null 
    }; 

  } catch (error) {
    console.error('[DB] Error during addTransaction, attempting rollback...:', error);
    if (currentDb) { 
      try { await currentDb.execAsync('ROLLBACK;'); } catch (rbError) { console.error('[DB] Rollback failed:', rbError); }
    }
    return null; // Or re-throw specific errors
  }
}

// Use SQLiteDatabase if needed
async function getAllTransactions(filters: TransactionFilters = {}): Promise<Transaction[]> {
  try {
    const currentDb = await getDbInstance();

    // Select transaction columns AND category name
    let query = `
      SELECT 
        t.id, t.timestamp, t.paymentMethod, t.categoryId, t.amount, t.reason, 
        c.name as categoryName 
      FROM transactions t
      JOIN categories c ON t.categoryId = c.id
    `;
    const whereClauses: string[] = [];
    const params: (string | number | null)[] = []; 

    // --- Apply Filters --- 

    // 1. Date Filter (using startDate and endDate)
    if (filters.startDate) {
      // Ensure start date is at the beginning of the day
      const startOfDay = new Date(filters.startDate);
      startOfDay.setHours(0, 0, 0, 0);
      whereClauses.push('t.timestamp >= ?');
      params.push(startOfDay.getTime());
    }
    if (filters.endDate) {
      // Ensure end date is at the end of the day
      const endOfDay = new Date(filters.endDate);
      endOfDay.setHours(23, 59, 59, 999);
      whereClauses.push('t.timestamp <= ?');
      params.push(endOfDay.getTime());
    }
    
    // Remove specific year/month filter if start/end dates are present? 
    // Or keep for potential other uses. Currently, year/month filter is kept 
    // but won't be used by AllTransactionsScreen if dates are set.
    else if (filters.year && filters.month) { // Fallback if no start/end date
      const year = filters.year;
      const month = filters.month;
      const firstDay = new Date(year, month - 1, 1);
      const lastDay = new Date(year, month, 0);
      const startTimestamp = firstDay.getTime();
      const endTimestamp = lastDay.getTime() + (24 * 60 * 60 * 1000 - 1);
      whereClauses.push('t.timestamp >= ? AND t.timestamp <= ?');
      params.push(startTimestamp, endTimestamp);
    }

    // 2. Payment Method Filter
    if (filters.paymentMethod && filters.paymentMethod !== 'all') {
      whereClauses.push('t.paymentMethod = ?');
      params.push(filters.paymentMethod);
    }
    
    // 3. Category Filter
    if (filters.category && filters.category !== 'all') {
       whereClauses.push('c.name = ?'); 
       params.push(filters.category);
    }
    
    // 4. Search Text Filter
    if (filters.searchText && filters.searchText.trim() !== '') {
       whereClauses.push('t.reason LIKE ?');
       params.push(`%${filters.searchText.trim()}%`); 
    }

    // --- Construct Final Query --- 
    if (whereClauses.length > 0) {
      query += ' WHERE ' + whereClauses.join(' AND ');
    }
    query += ' ORDER BY t.timestamp DESC'; // Keep default sort

    // LIMIT clause (kept for other potential uses, e.g., budget screen)
    if (filters.limit && filters.limit > 0) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    // --- Execute Query --- 
    const results = await currentDb.getAllAsync<Transaction>(query, params);
    return results ?? [];
  } catch (error) {
    console.error('[DB] Error getting filtered transactions:', error);
    return []; // Return empty array on error
  }
}

// Use SQLiteDatabase if needed
async function deleteTransaction(transactionId: string): Promise<boolean> {
  let currentDb: SQLite.SQLiteDatabase | null = null; // Use SQLiteDatabase type
  try {
    currentDb = await getDbInstance();
    await currentDb.execAsync('BEGIN TRANSACTION;');

    // ... rest of deleteTransaction logic ...
     // 1. Get transaction details including category name
    const transactionToDelete = await currentDb.getFirstAsync<
       { amount: number; paymentMethod: TransactionPaymentMethod; categoryId: number; categoryName: string }
    >(
      'SELECT t.amount, t.paymentMethod, t.categoryId, c.name as categoryName '
      + 'FROM transactions t JOIN categories c ON t.categoryId = c.id WHERE t.id = ?',
      [transactionId]
    );

    if (!transactionToDelete) { 
        console.warn(`[DB Delete Tx ${transactionId}] Not found.`); 
        await currentDb.execAsync('ROLLBACK;'); return false; 
    }

    // 2. Delete the transaction
    const deleteResult = await currentDb.runAsync('DELETE FROM transactions WHERE id = ?', [transactionId]);
    if ((deleteResult.changes ?? 0) === 0) { throw new Error(`Failed to delete row ${transactionId}.`); }

    // 3. Get current balance
    const { amount: transactionAmount, paymentMethod, categoryName } = transactionToDelete;
    const currentBalanceResult = await currentDb.getFirstAsync<{ amount: number }>(
      'SELECT amount FROM balances WHERE type = ?', [paymentMethod]
    );
    const currentBalance = currentBalanceResult?.amount ?? 0;

    // 4. Calculate new balance based on category name
    const isGain = categoryName.toLowerCase() === 'gain';
    const newBalance = isGain ? (currentBalance - transactionAmount) : (currentBalance + transactionAmount);

    // 5. Update balance (use runAsync directly)
  const updateResult = await currentDb.runAsync('UPDATE balances SET amount = ? WHERE type = ?', [newBalance, paymentMethod]);
     if ((updateResult.changes ?? 0) === 0) { throw new Error(`Failed balance update for ${paymentMethod}.`); }

    await currentDb.execAsync('COMMIT;');
    return true;

  } catch (error) {
    console.error(`[DB] Error deleting transaction ${transactionId}:`, error);
    if (currentDb) { 
      try { await currentDb.execAsync('ROLLBACK;'); } catch (rbError) { console.error('Rollback failed:', rbError); }
    }
    return false; 
  }
}

// --- End Transaction Functions ---

// --- Test Data Generation --- (Assuming definition is correct)
async function generateTestDataForMonth(year: number, month: number, count: number = 100): Promise<boolean> {
  console.log(`[DB TestData] Generating ${count} transactions for ${year}-${month}...`);
  try {
    const currentDb = await getDbInstance(); // Use correct type
    const categories = await getAllCategories();
    
    const expenseCategories = categories.filter(c => c.name.toLowerCase() !== 'gain');
    const gainCategory = categories.find(c => c.name.toLowerCase() === 'gain');

    if (expenseCategories.length === 0 && !gainCategory) {
        console.error("[DB TestData] No categories found to generate data.");
        return false;
    }

    const transactionsToAdd: { 
        paymentMethod: TransactionPaymentMethod;
        categoryId: number;
        amount: number;
        reason: string | null;
        timestamp: number;
    }[] = [];
    
    const firstDayOfMonth = new Date(year, month - 1, 1).getTime();
    const firstDayOfNextMonth = new Date(year, month, 1).getTime(); 
    const timeRange = firstDayOfNextMonth - firstDayOfMonth;

    const paymentMethods: TransactionPaymentMethod[] = ['gpay', 'cash'];
    const reasons = ["Coffee", "Lunch", "Groceries", "Salary", "Movie Ticket", "Bus Fare", "Snacks", "Gift", "Freelance Payment", "Dinner"];

    for (let i = 0; i < count; i++) {
      const isGain = gainCategory && Math.random() < 0.1; 
      let categoryId: number;
      let amount: number;
      
      if (isGain && gainCategory) {
          categoryId = gainCategory.id;
          amount = Math.floor(Math.random() * (20000 - 5000 + 1)) + 5000;
      } else if (expenseCategories.length > 0) {
          const randomCategory = expenseCategories[Math.floor(Math.random() * expenseCategories.length)];
          categoryId = randomCategory.id;
          amount = Math.floor(Math.random() * (3000 - 50 + 1)) + 50;
      } else {
          console.warn("[DB TestData] Skipping transaction due to missing category type.");
          continue; 
      }

      const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
      const reason = reasons[Math.floor(Math.random() * reasons.length)];
      const timestamp = firstDayOfMonth + Math.floor(Math.random() * timeRange);

      transactionsToAdd.push({
        paymentMethod,
        categoryId,
        amount,
        reason: `${reason} (Test)`,
        timestamp
      });
    }
    
    await currentDb.withTransactionAsync(async () => { // Use withTransactionAsync (simpler)
        console.log("[DB TestData] Inserting test transactions...");
        let insertedCount = 0;
        for (const transData of transactionsToAdd) {
             const category = categories.find(c => c.id === transData.categoryId);
             const isGain = category?.name.toLowerCase() === 'gain';
             const amount = transData.amount;
             const paymentMethod = transData.paymentMethod;

             let success = false;
             if (isGain) {
                 // Adding gain always succeeds for balance
                 await currentDb.runAsync('UPDATE balances SET amount = amount + ? WHERE type = ?', [amount, paymentMethod]);
                 success = true;
             } else {
                 // Check balance first
                 const currentBalanceResult = await currentDb.getFirstAsync<{ amount: number }>(
                     'SELECT amount FROM balances WHERE type = ?', [paymentMethod]
                 );
                 if ((currentBalanceResult?.amount ?? 0) >= amount) {
                     await currentDb.runAsync('UPDATE balances SET amount = amount - ? WHERE type = ?', [amount, paymentMethod]);
                     success = true;
                 } else {
                     console.warn(`[DB TestData] Skipping expense ${amount} for ${paymentMethod} due to insufficient balance.`);
                 }
             }
            
             // Insert transaction only if balance update was successful or not needed (gain)
             if(success) {
                const newId = uuidv4();
                await currentDb.runAsync(
                    'INSERT INTO transactions (id, timestamp, paymentMethod, categoryId, amount, reason) VALUES (?, ?, ?, ?, ?, ?)',
                    [newId, transData.timestamp, transData.paymentMethod, transData.categoryId, transData.amount, transData.reason || null]
                );
                insertedCount++;
             }
        }
         console.log(`[DB TestData] Attempted to insert ${count}, actually inserted ${insertedCount} transactions.`);
    });

    console.log(`[DB TestData] Finished generating transactions for ${year}-${month}.`);
    return true;
  } catch (error) {
    console.error(`[DB TestData] Error generating test data for ${year}-${month}:`, error);
    return false;
  }
}
// --- End Test Data Generation ---

// --- Add getTransactionById ---
async function getTransactionById(id: string): Promise<Transaction | null> {
  try {
    const currentDb = await getDbInstance();
    const result = await currentDb.getFirstAsync<Transaction>(
      `SELECT 
        t.*, 
        c.name as categoryName, 
        c.monthlyLimit as categoryLimit 
      FROM transactions t 
      LEFT JOIN categories c ON t.categoryId = c.id 
      WHERE t.id = ?`,
      [id]
    );
    return result ?? null;
  } catch (error) {
    console.error('[DB] Error fetching transaction by ID:', error);
    return null;
  }
}

// --- Add updateTransaction --- 
async function updateTransaction(id: string, data: NewTransactionData): Promise<boolean> {
  let currentDb: SQLite.SQLiteDatabase | null = null;
  try {
    currentDb = await getDbInstance();
    await currentDb.execAsync('BEGIN TRANSACTION;');

    // 1. Get the OLD transaction details
    const oldTransaction = await currentDb.getFirstAsync<Transaction>(
      'SELECT amount, paymentMethod, categoryId FROM transactions WHERE id = ?',
      [id]
    );
    if (!oldTransaction) {
      throw new Error('Original transaction not found for update.');
    }

    // 2. Get OLD and NEW category details (needed for gain check)
    const [oldCategory, newCategory] = await Promise.all([
      currentDb.getFirstAsync<Category>('SELECT name FROM categories WHERE id = ?', [oldTransaction.categoryId]),
      currentDb.getFirstAsync<Category>('SELECT name FROM categories WHERE id = ?', [data.categoryId])
    ]);
    if (!newCategory) {
      throw new Error(`New category with ID ${data.categoryId} not found.`);
    }
    const wasGain = oldCategory?.name.toLowerCase() === 'gain';
    const isGain = newCategory?.name.toLowerCase() === 'gain';

    // 3. Calculate the balance adjustment amount
    let balanceAdjustment = 0;
    // If payment method changed, revert old and apply new
    if (oldTransaction.paymentMethod !== data.paymentMethod) {
      // Revert old effect: Add back if expense, subtract if gain
      const revertAmount = wasGain ? -oldTransaction.amount : oldTransaction.amount;
      // Inline logic: Get old balance and update
      const oldBalanceResult = await currentDb.getFirstAsync<{ amount: number }>('SELECT amount FROM balances WHERE type = ?', [oldTransaction.paymentMethod]);
      const oldBalance = oldBalanceResult?.amount ?? 0;
      await currentDb.runAsync('UPDATE balances SET amount = ? WHERE type = ?', [oldBalance + revertAmount, oldTransaction.paymentMethod]);
      
      // Apply new effect: Subtract if expense, add if gain
      const applyAmount = isGain ? data.amount : -data.amount;
      // Inline logic: Get new balance type and update
      const newBalanceResult = await currentDb.getFirstAsync<{ amount: number }>('SELECT amount FROM balances WHERE type = ?', [data.paymentMethod]);
      const newBalanceValue = newBalanceResult?.amount ?? 0;
      await currentDb.runAsync('UPDATE balances SET amount = ? WHERE type = ?', [newBalanceValue + applyAmount, data.paymentMethod]);

    } else { 
      // Payment method is the same, calculate net change
      const oldEffect = wasGain ? oldTransaction.amount : -oldTransaction.amount;
      const newEffect = isGain ? data.amount : -data.amount;
      balanceAdjustment = newEffect - oldEffect;
      // Inline logic: Get current balance and update
      const currentBalanceResult = await currentDb.getFirstAsync<{ amount: number }>('SELECT amount FROM balances WHERE type = ?', [data.paymentMethod]);
      const currentBalance = currentBalanceResult?.amount ?? 0;
      await currentDb.runAsync('UPDATE balances SET amount = ? WHERE type = ?', [currentBalance + balanceAdjustment, data.paymentMethod]);
    }

    // 4. Update the transaction details (Handle potentially undefined reason)
    const updateResult = await currentDb.runAsync(
      'UPDATE transactions SET amount = ?, reason = ?, paymentMethod = ?, categoryId = ?, timestamp = ? WHERE id = ?',
      [data.amount, data.reason || null, data.paymentMethod, data.categoryId, Date.now(), id] // Pass null if reason is empty/undefined
    );

    if ((updateResult.changes ?? 0) === 0) {
      throw new Error('Failed to update transaction record.');
    }

    // 5. Commit
    await currentDb.execAsync('COMMIT;');
    console.log(`[DB] Transaction ${id} updated successfully.`);
    return true;

  } catch (error) {
    console.error('[DB] Error updating transaction:', error);
    if (currentDb) {
      try {
        await currentDb.execAsync('ROLLBACK;');
        console.log("[DB] Update transaction rolled back.");
      } catch (rollbackError) {
        console.error("[DB] CRITICAL: Rollback failed after update transaction error:", rollbackError);
      }
    }
    return false;
  }
}

// Export block (ensure it's the last thing in the file)
export {
  getAllCategories,
  addCategory,
  updateCategory,
  deleteCategory,
  getGainCategoryId,
  getBalance,
  getAllBalances,
  updateBalance,
  addTransaction,
  getAllTransactions,
  deleteTransaction,
  Category,
  BalanceType,
  Balance,
  Transaction,
  NewTransactionData,
  TransactionPaymentMethod,
  TransactionFilters, // Export the correct filters type
  generateTestDataForMonth,
  getTransactionById,
  updateTransaction,
}; 