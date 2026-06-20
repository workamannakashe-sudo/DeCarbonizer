# Use official Node.js runtime as the base image
FROM node:20-slim

# Set the working directory inside the container
WORKDIR /app

# Copy package.json
COPY package.json ./

# Install production dependencies (if any are added later)
RUN npm install --only=production

# Copy the rest of the application files
COPY . .

# Expose the port that the application runs on
EXPOSE 8080

# Start the application
CMD ["npm", "start"]
