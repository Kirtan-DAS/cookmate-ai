from nutrition_engine import calculate_nutrition, NutritionCalculationInput

def test_serving_scaling():
    base = {'base_servings': 2, 'ingredients': [{'name':'Toor dal', 'grams_for_base_recipe':100, 'food':{'food_name':'Toor dal','source':'example test data, not nutrition reference','per_100g':{'protein_g':20}}}]}
    result = calculate_nutrition(NutritionCalculationInput(**base, prepared_servings=4, eaten_servings=1))
    assert result['ingredients'][0]['prepared_grams'] == 200
    assert result['batch_nutrition']['protein_g'] == 40
    assert result['consumed_nutrition']['protein_g'] == 10
    assert result['consumed_nutrition']['iron_mg'] is None
    result2 = calculate_nutrition(NutritionCalculationInput(**base, prepared_servings=4, eaten_servings=4))
    assert result2['consumed_nutrition']['protein_g'] == 40

if __name__ == '__main__':
    test_serving_scaling()
    print('Nutrition serving calculations passed')
