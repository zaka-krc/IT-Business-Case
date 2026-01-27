const request = require('supertest');
const app = require('../server');
const db = require('../database');

// --- MOCKS ---

// 1. Mock Database
jest.mock('../database', () => ({
    all: jest.fn(),
    get: jest.fn(),
    run: jest.fn(),
    prepare: jest.fn(() => ({
        run: jest.fn(),
        finalize: jest.fn()
    }))
}));

// 2. Mock RabbitMQ (amqplib) to prevent connection attempts
jest.mock('amqplib', () => ({
    connect: jest.fn().mockResolvedValue({
        createChannel: jest.fn().mockResolvedValue({
            assertExchange: jest.fn().mockResolvedValue(true),
            assertQueue: jest.fn().mockResolvedValue(true),
            bindQueue: jest.fn().mockResolvedValue(true),
            publish: jest.fn().mockReturnValue(true),
            consume: jest.fn(),
            close: jest.fn().mockResolvedValue(true)
        }),
        close: jest.fn().mockResolvedValue(true)
    })
}));

describe('Server & API Tests', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // --- TEST 1: GET /api/products ---
    test('GET /api/products should return list of products', async () => {
        // Setup mock response
        const mockProducts = [
            { id: 1, name: 'Laptop', price: 999, stock: 10, image_url: 'img.png' },
            { id: 2, name: 'Mouse', price: 20, stock: 50, image_url: 'mouse.png' }
        ];

        // Mock db.all implementation
        db.all.mockImplementation((query, params, callback) => {
            callback(null, mockProducts);
        });

        const res = await request(app).get('/api/products');

        expect(res.statusCode).toEqual(200);
        expect(res.body.length).toEqual(2);
        expect(res.body[0].name).toEqual('Laptop');
        // Check mapping logic (image_url -> image)
        expect(res.body[0].image).toEqual('img.png');
    });

    // --- TEST 2: POST /api/login (Success) ---
    test('POST /api/login should return user on correct credentials', async () => {
        const mockUser = {
            id: 1,
            email: 'test@example.com',
            password_hash: '$2b$10$FakeHashForTestingPurposesOnly..........', // we need to mock bcrypt too if we want full flow, OR mock db response
            first_name: 'Test',
            last_name: 'User',
            role: 'user'
        };

        // We also need to mock bcrypt because server.js uses it
        // But since we can't easily mock bcrypt within the same file without hoisting or jest.mock('bcrypt'), 
        // let's rely on the fact that we can Mock bcrypt too.
    });
});
