#-------------------------------------------------------
# ビルド環境
#-------------------------------------------------------
FROM node:18-alpine as builder

# Node APIサーバーのビルド
COPY node /node
WORKDIR /node
RUN npm install
RUN npm run build


#-------------------------------------------------------
# 製品環境
#-------------------------------------------------------
FROM node:18-alpine as releaser

# 依存パッケージのインストール
RUN apk add docker

# Node API サーバーのインストール
COPY --from=builder /node /node
CMD ["node", "/node/dist/index.mjs"]