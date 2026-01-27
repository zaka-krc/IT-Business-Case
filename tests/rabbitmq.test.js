const amqp = require('amqplib');

// Mock the amqplib library
jest.mock('amqplib');

describe('RabbitMQ Connection (Mocked)', () => {
    it('should simulate a successful connection', async () => {
        // Setup the mock to return a fake connection object
        const mockClose = jest.fn();
        amqp.connect.mockResolvedValue({
            close: mockClose
        });

        const url = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

        // Call the connect function (which is now mocked)
        const connection = await amqp.connect(url);

        // Assertions
        expect(amqp.connect).toHaveBeenCalledWith(url);
        expect(connection).toBeDefined();

        // Close the (fake) connection
        await connection.close();
        expect(mockClose).toHaveBeenCalled();
    });
});
