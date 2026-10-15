describe("manual trip request journey", () => {
  it("signs in, creates, edits, saves, reviews, submits, and reloads", () => {
    cy.visit("/login");
    cy.get("#email").clear().type("alex@northstar.demo");
    cy.get("#password").clear().type("Password123!");
    cy.contains("button", "Sign in").click();
    cy.contains("Trip requests").should("be.visible");
    cy.contains("button", "New trip request").click();
    cy.contains("Edit request").should("be.visible");

    cy.get("#destination").select("JFK");
    cy.get("#departureDate").type("2026-11-12");
    cy.get("#returnDate").type("2026-11-15");
    cy.get("#purpose").clear().type("customer workshop");
    cy.contains("button", "Save draft").click();
    cy.contains("Saved").should("be.visible");

    cy.contains("button", "Review request").click();
    cy.contains("Review request").should("be.visible");
    cy.contains("button", "Submit request").click();
    cy.contains("Trip request submitted").should("be.visible");
    cy.contains("customer workshop").should("be.visible");

    cy.reload();
    cy.contains("Trip request submitted").should("be.visible");
    cy.contains("SFO → JFK").should("be.visible");
  });
});
