import { connectLambda, getStore } from "@netlify/blobs";
import { isAuthenticated } from "../lib/admin-auth.js";

const STORE_NAME = "products";
const PRODUCTS_KEY = "all-products";

const jsonHeaders = {
  "Content-Type": "application/json",
};

const sortProducts = (products = []) =>
  [...products].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

const parseBody = (body) => {
  if (!body) return {};

  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

const getProductsStore = (event) => {
  connectLambda(event);
  return getStore(STORE_NAME);
};

const readProducts = async (store) => {
  const products = await store.get(PRODUCTS_KEY, { type: "json" });
  return Array.isArray(products) ? products : [];
};

export const handler = async (event) => {
  const method = event.httpMethod;

  try {
    const store = getProductsStore(event);

    if (method === "GET") {
      const products = sortProducts(await readProducts(store));
      return {
        statusCode: 200,
        headers: jsonHeaders,
        body: JSON.stringify({ products }),
      };
    }

    if (method === "POST") {
      if (!(await isAuthenticated(event))) {
        return {
          statusCode: 401,
          headers: jsonHeaders,
          body: JSON.stringify({ error: "Not authenticated" }),
        };
      }

      const product = parseBody(event.body);
      if (!product?.id || !product?.image || !product?.title) {
        return {
          statusCode: 400,
          headers: jsonHeaders,
          body: JSON.stringify({ error: "Invalid product payload" }),
        };
      }

      const existingProducts = await readProducts(store);
      const nextProducts = sortProducts([
        product,
        ...existingProducts.filter((item) => item.id !== product.id),
      ]);

      await store.setJSON(PRODUCTS_KEY, nextProducts);

      return {
        statusCode: 200,
        headers: jsonHeaders,
        body: JSON.stringify({ product }),
      };
    }

    if (method === "DELETE") {
      if (!(await isAuthenticated(event))) {
        return {
          statusCode: 401,
          headers: jsonHeaders,
          body: JSON.stringify({ error: "Not authenticated" }),
        };
      }

      const { id } = parseBody(event.body);
      if (!id) {
        return {
          statusCode: 400,
          headers: jsonHeaders,
          body: JSON.stringify({ error: "Product id is required" }),
        };
      }

      const existingProducts = await readProducts(store);
      const nextProducts = existingProducts.filter(
        (product) => product.id !== id,
      );
      await store.setJSON(PRODUCTS_KEY, nextProducts);

      return {
        statusCode: 200,
        headers: jsonHeaders,
        body: JSON.stringify({ id }),
      };
    }

    return {
      statusCode: 405,
      headers: jsonHeaders,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  } catch (error) {
    console.error("products handler error:", error);
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ error: "Could not manage products" }),
    };
  }
};
