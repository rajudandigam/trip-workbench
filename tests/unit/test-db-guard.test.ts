import { afterEach, describe, expect, it } from "vitest";
import {
  resolveDisposableTestDatabaseUrl,
  sameDatabaseTarget,
} from "../api/helpers.js";

describe("disposable test database guard", () => {
  const original = {
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    TW_ISOLATED_TEST_DB: process.env.TW_ISOLATED_TEST_DB,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("treats the same host/port/database as one target", () => {
    expect(
      sameDatabaseTarget(
        "postgresql://trip:trip@127.0.0.1:5433/trip_workbench",
        "postgresql://trip:trip@127.0.0.1:5433/trip_workbench",
      ),
    ).toBe(true);
    expect(
      sameDatabaseTarget(
        "postgresql://trip:trip@127.0.0.1:5433/trip_workbench",
        "postgresql://trip:trip@127.0.0.1:5433/trip_workbench_test",
      ),
    ).toBe(false);
  });

  it("refuses a missing TEST_DATABASE_URL", () => {
    expect(() =>
      resolveDisposableTestDatabaseUrl({
        DATABASE_URL: "postgresql://trip:trip@127.0.0.1:5433/trip_workbench",
      }),
    ).toThrow(/TEST_DATABASE_URL is required/);
  });

  it("refuses a test URL that aliases the application database", () => {
    const shared = "postgresql://trip:trip@127.0.0.1:5433/trip_workbench";
    expect(() =>
      resolveDisposableTestDatabaseUrl({
        DATABASE_URL: shared,
        TEST_DATABASE_URL: shared,
      }),
    ).toThrow(/same database as DATABASE_URL/);
  });

  it("allows an explicitly isolated shared target", () => {
    const ephemeral = "postgresql://postgres@127.0.0.1:51999/postgres";
    expect(
      resolveDisposableTestDatabaseUrl({
        DATABASE_URL: ephemeral,
        TEST_DATABASE_URL: ephemeral,
        TW_ISOLATED_TEST_DB: "1",
      }),
    ).toBe(ephemeral);
  });

  it("allows a distinct disposable test database", () => {
    expect(
      resolveDisposableTestDatabaseUrl({
        DATABASE_URL: "postgresql://trip:trip@127.0.0.1:5433/trip_workbench",
        TEST_DATABASE_URL: "postgresql://trip:trip@127.0.0.1:5433/trip_workbench_test",
      }),
    ).toBe("postgresql://trip:trip@127.0.0.1:5433/trip_workbench_test");
  });
});
