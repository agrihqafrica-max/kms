def test_tc01_api_schema_exists():
    import main
    schema = main.app.openapi()
    assert '/organizations/register' in schema['paths']
    operation = schema['paths']['/organizations/register']['post']
    assert '201' in operation['responses']
