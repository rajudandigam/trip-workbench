describe("manual event draft journey", () => {
  it("signs in, creates, edits, saves, reviews, and records an event", () => {
    cy.visit("/login");
    cy.get("#email").clear().type("alex@northstar.demo");
    cy.get("#password").clear().type("Password123!");
    cy.contains("button", "Sign in").click();
    cy.contains("a", "Events").click();
    cy.contains("Event drafts").should("be.visible");
    cy.contains("button", "New event draft").click();
    cy.contains("Edit event draft").should("be.visible");

    cy.get("#event-title").clear().type("Customer planning workshop");
    cy.get("#event-start").type("2026-12-01");
    cy.get("#event-end").type("2026-12-02");
    cy.get("#event-loc").select("Northstar Demo Campus — Atrium");
    cy.contains("button", "Save draft").click();
    cy.contains("Saved").should("be.visible");

    cy.contains("button", "Review event").click();
    cy.contains("Review event").should("be.visible");
    cy.contains("button", "Record event request").click();
    cy.contains("Event request recorded").should("be.visible");
    cy.contains("Customer planning workshop").should("be.visible");

    cy.reload();
    cy.contains("Event request recorded").should("be.visible");
    cy.contains("Northstar Demo Campus — Atrium").should("be.visible");
  });
});
