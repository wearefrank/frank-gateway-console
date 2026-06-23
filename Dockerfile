# Stage 1: Build frontend
FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY front-end/package*.json ./
RUN npm ci
COPY front-end/ .
RUN npx vite build

# Stage 2: Build backend (with frontend static files bundled in)
FROM maven:3.9-eclipse-temurin-21 AS backend-build
WORKDIR /build
COPY Back-End/pom.xml .
RUN mvn dependency:go-offline -q
COPY Back-End/src ./src
COPY --from=frontend-build /app/dist ./src/main/resources/static
RUN mvn package -Dmaven.test.skip=true -q

# Stage 3: Runtime
FROM eclipse-temurin:21-jre-alpine
WORKDIR /data
COPY --from=backend-build /build/target/*.jar /app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app.jar"]
