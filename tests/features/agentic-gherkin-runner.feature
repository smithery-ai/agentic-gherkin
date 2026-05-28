Feature: Agentic Gherkin runner

  Scenario: Passing scenarios produce readable and raw reports
    Given a project has Gherkin acceptance scenarios
    When Agentic Gherkin evaluates them with an SDK-backed provider
    Then it writes a readable summary, Cucumber reports, and raw provider logs

  Scenario: The runner keeps scenario coverage exact
    Given a project has multiple scenarios with stable names
    When Agentic Gherkin aggregates provider results
    Then every scenario is represented exactly once in the final report
