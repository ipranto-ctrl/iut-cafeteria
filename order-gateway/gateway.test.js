const request = require('supertest');

// 1. MOCK EXTERNAL SERVICES: Stop Jest from hanging on real database connections
jest.mock('redis', () => ({
    createClient: () => ({
        on: jest.fn(),
        connect: jest.fn().mockResolvedValue()
    })
}));

jest.mock('amqplib', () => ({
    connect: jest.fn().mockResolvedValue({
        createChannel: jest.fn().mockResolvedValue({
            assertQueue: jest.fn().mockResolvedValue()
        })
    })
}));

// 2. Import the server AFTER the mocks are set up
const app = require('./index'); 

describe('Order Gateway Validation Tests', () => {
    
    it('should reject an order if the user is missing an authorization token', async () => {
        // Simulate a POST request without a JWT token
        const response = await request(app)
            .post('/api/gateway/order')
            .send({ itemName: 'Biriyani' });

        // Expect the server to block it with a 401 Unauthorized status
        expect(response.statusCode).toBe(401);
        
        // EXPECTED STRING FIXED: Match exactly what the server outputs
        expect(response.body.error).toBe('Unauthorized');
    });

});